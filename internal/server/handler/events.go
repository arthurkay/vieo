package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/go-chi/chi/v5"
)

func ListJobEvents(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid job id", http.StatusBadRequest)
			return
		}

		events, err := models.ListEventsByJob(r.Context(), db, jobID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if events == nil {
			events = []models.TimelineEvent{}
		}
		writeJSON(w, events)
	}
}

func CreateJobEvent(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid job id", http.StatusBadRequest)
			return
		}

		var req struct {
			TimeOffset float64 `json:"time_offset"`
			Label      string  `json:"label"`
			Color      string  `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if req.Label == "" {
			http.Error(w, "label is required", http.StatusBadRequest)
			return
		}

		event, err := models.CreateEvent(r.Context(), db, jobID, req.TimeOffset, req.Label, req.Color)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, event)
	}
}

func DeleteEvent(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteEvent(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
