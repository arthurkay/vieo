package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/go-chi/chi/v5"
)

func ListSchedules(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var sourceID *int64
		if s := r.URL.Query().Get("source_id"); s != "" {
			id, err := strconv.ParseInt(s, 10, 64)
			if err == nil {
				sourceID = &id
			}
		}

		schedules, err := models.ListSchedules(r.Context(), db, sourceID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if schedules == nil {
			schedules = []models.Schedule{}
		}
		writeJSON(w, schedules)
	}
}

func CreateSchedule(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SourceID   int64   `json:"source_id"`
			Name       string  `json:"name"`
			StartTime  string  `json:"start_time"`
			EndTime    *string `json:"end_time"`
			DaysOfWeek string  `json:"days_of_week"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if req.SourceID == 0 || req.StartTime == "" {
			http.Error(w, "source_id and start_time are required", http.StatusBadRequest)
			return
		}

		schedule := &models.Schedule{
			SourceID:   req.SourceID,
			Name:       req.Name,
			Enabled:    true,
			StartTime:  req.StartTime,
			EndTime:    req.EndTime,
			DaysOfWeek: req.DaysOfWeek,
		}

		if err := models.CreateSchedule(r.Context(), db, schedule); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		created, _ := models.GetSchedule(r.Context(), db, schedule.ID)
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, created)
	}
}

func GetSchedule(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid schedule id", http.StatusBadRequest)
			return
		}

		schedule, err := models.GetSchedule(r.Context(), db, id)
		if err != nil {
			http.Error(w, "schedule not found", http.StatusNotFound)
			return
		}
		writeJSON(w, schedule)
	}
}

func UpdateSchedule(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid schedule id", http.StatusBadRequest)
			return
		}

		existing, err := models.GetSchedule(r.Context(), db, id)
		if err != nil {
			http.Error(w, "schedule not found", http.StatusNotFound)
			return
		}

		var req struct {
			Name       *string `json:"name"`
			Enabled    *bool   `json:"enabled"`
			StartTime  *string `json:"start_time"`
			EndTime    *string `json:"end_time"`
			DaysOfWeek *string `json:"days_of_week"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if req.Name != nil {
			existing.Name = *req.Name
		}
		if req.Enabled != nil {
			existing.Enabled = *req.Enabled
		}
		if req.StartTime != nil {
			existing.StartTime = *req.StartTime
		}
		if req.EndTime != nil {
			existing.EndTime = req.EndTime
		}
		if req.DaysOfWeek != nil {
			existing.DaysOfWeek = *req.DaysOfWeek
		}

		if err := models.UpdateSchedule(r.Context(), db, existing); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		updated, _ := models.GetSchedule(r.Context(), db, id)
		writeJSON(w, updated)
	}
}

func DeleteSchedule(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid schedule id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteSchedule(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
