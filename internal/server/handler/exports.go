package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/job"
	"github.com/go-chi/chi/v5"
)

func CreateExport(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SourceID  int64   `json:"source_id"`
			OutputID  int64   `json:"output_id"`
			StartTime float64 `json:"start_time"`
			Duration  float64 `json:"duration"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if req.SourceID == 0 || req.OutputID == 0 {
			http.Error(w, "source_id and output_id are required", http.StatusBadRequest)
			return
		}
		if req.Duration <= 0 {
			http.Error(w, "duration must be positive", http.StatusBadRequest)
			return
		}

		export, err := mgr.StartExport(r.Context(), req.SourceID, req.OutputID, req.StartTime, req.Duration)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, export)
	}
}

func ListExports(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		exports, err := models.ListExports(r.Context(), db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if exports == nil {
			exports = []models.Export{}
		}
		writeJSON(w, exports)
	}
}

func GetExport(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		export, err := models.GetExport(r.Context(), db, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, export)
	}
}

func DownloadExport(db *sql.DB, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		export, err := models.GetExport(r.Context(), db, id)
		if err != nil {
			http.Error(w, "export not found", http.StatusNotFound)
			return
		}

		if export.Status != "completed" || export.FilePath == "" {
			http.Error(w, "export not ready", http.StatusNotFound)
			return
		}

		if _, err := os.Stat(export.FilePath); os.IsNotExist(err) {
			http.Error(w, "export file not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="clip_%d.mp4"`, id))
		http.ServeFile(w, r, export.FilePath)
	}
}

func DeleteExport(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		export, err := models.GetExport(r.Context(), db, id)
		if err != nil {
			http.Error(w, "export not found", http.StatusNotFound)
			return
		}

		if export.Status == "processing" {
			_ = mgr.CancelExport(r.Context(), id)
		}

		if export.FilePath != "" {
			_ = os.Remove(export.FilePath)
			dir := filepath.Dir(export.FilePath)
			_ = os.Remove(dir)
		}

		if err := models.DeleteExport(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
