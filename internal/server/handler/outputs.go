package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/job"
	"github.com/arthur/vieo/internal/media"
	"github.com/go-chi/chi/v5"
)

func ListOutputs(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		outputs, err := models.ListOutputs(r.Context(), db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, outputs)
	}
}

func CreateOutput(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var o models.Output
		if err := json.NewDecoder(r.Body).Decode(&o); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if o.SourceID <= 0 {
			http.Error(w, "source_id must be positive", http.StatusBadRequest)
			return
		}

		if err := models.CreateOutput(r.Context(), db, &o); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, o)
	}
}

func DeleteOutput(db *sql.DB, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		dir := media.OutputDir(dataDir, id)
		if err := os.RemoveAll(dir); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if err := models.DeleteOutput(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetOutputStorage(db *sql.DB, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		dir := media.OutputDir(dataDir, id)
		size, err := media.DirSize(dir)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		duration := media.PlaylistDuration(dir)

		writeJSON(w, map[string]interface{}{"bytes": size, "duration": duration})
	}
}

func CreateOutputDownload(db *sql.DB, mgr *job.Manager, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		output, err := models.GetOutput(r.Context(), db, id)
		if err != nil {
			http.Error(w, "output not found", http.StatusNotFound)
			return
		}

		dir := media.OutputDir(dataDir, id)
		duration := media.PlaylistDuration(dir)
		if duration <= 0 {
			http.Error(w, "nothing to download", http.StatusBadRequest)
			return
		}

		export, err := mgr.StartExport(r.Context(), output.SourceID, id, 0, duration)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, export)
	}
}
