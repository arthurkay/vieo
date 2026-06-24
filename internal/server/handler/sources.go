package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/go-chi/chi/v5"
)

func ListSources(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var channelID *int64
		if cid := r.URL.Query().Get("channel_id"); cid != "" {
			id, err := strconv.ParseInt(cid, 10, 64)
			if err != nil {
				http.Error(w, "invalid channel_id", http.StatusBadRequest)
				return
			}
			channelID = &id
		}

		sources, err := models.ListSources(r.Context(), db, channelID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, sources)
	}
}

func GetSource(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		source, err := models.GetSource(r.Context(), db, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, source)
	}
}

func CreateSource(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var s models.Source
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		validTypes := map[string]bool{"file": true, "hls": true, "rtmp": true, "rtsp": true, "device": true}
		if !validTypes[s.Type] {
			http.Error(w, "invalid type: must be file, hls, rtmp, rtsp, or device", http.StatusBadRequest)
			return
		}

		if s.StreamType == "" {
			s.StreamType = "audio_video"
		}
		validStreamTypes := map[string]bool{"audio_video": true, "video_only": true, "audio_only": true}
		if !validStreamTypes[s.StreamType] {
			http.Error(w, "invalid stream_type: must be audio_video, video_only, or audio_only", http.StatusBadRequest)
			return
		}

		if s.ChannelID == 0 {
			http.Error(w, "channel_id is required", http.StatusBadRequest)
			return
		}

		if s.URL == "" {
			http.Error(w, "url is required", http.StatusBadRequest)
			return
		}

		if err := models.CreateSource(r.Context(), db, &s); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, s)
	}
}

func DeleteSource(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteSource(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
