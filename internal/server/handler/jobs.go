package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/job"
	"github.com/go-chi/chi/v5"
)

func ListJobs(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		var sourceID *int64
		if sid := r.URL.Query().Get("source_id"); sid != "" {
			id, err := strconv.ParseInt(sid, 10, 64)
			if err != nil {
				http.Error(w, "invalid source_id", http.StatusBadRequest)
				return
			}
			sourceID = &id
		}

		jobs, err := models.ListJobs(r.Context(), db, status, sourceID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, jobs)
	}
}

func CreateJob(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SourceID int64 `json:"source_id"`
			OutputID int64 `json:"output_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if req.SourceID <= 0 {
			http.Error(w, "source_id must be positive", http.StatusBadRequest)
			return
		}

		if req.OutputID <= 0 {
			http.Error(w, "output_id must be positive", http.StatusBadRequest)
			return
		}

		if _, err := models.GetSource(r.Context(), db, req.SourceID); err != nil {
			http.Error(w, "source not found", http.StatusNotFound)
			return
		}

		if _, err := models.GetOutput(r.Context(), db, req.OutputID); err != nil {
			http.Error(w, "output not found", http.StatusNotFound)
			return
		}

		j, err := mgr.StartJob(r.Context(), req.SourceID, req.OutputID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, j)
	}
}

func StopJob(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := mgr.StopJob(r.Context(), id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func PauseJob(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := mgr.PauseJob(r.Context(), id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func RetryJob(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := mgr.RetryJob(r.Context(), id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func DeleteJob(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteJob(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
