package handler

import (
	"context"
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

		validTypes := map[string]bool{"file": true, "hls": true, "rtmp": true, "rtsp": true, "device": true, "udp": true, "rtp": true, "srt": true}
		if !validTypes[s.Type] {
			http.Error(w, "invalid type: must be file, hls, rtmp, rtsp, device, udp, rtp, or srt", http.StatusBadRequest)
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

func UpdateSource(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		var req struct {
			Name     *string         `json:"name"`
			Metadata map[string]any  `json:"metadata"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if err := models.UpdateSource(r.Context(), db, id, req.Name); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if req.Metadata != nil {
			if err := models.UpdateSourceMetadata(r.Context(), db, id, req.Metadata); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		source, err := models.GetSource(r.Context(), db, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, source)
	}
}

func DeleteSource(db *sql.DB, mgr *job.Manager, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		cleanupSourceResources(r.Context(), db, mgr, dataDir, id)

		if err := models.DeleteSource(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// cleanupSourceResources stops any active jobs/exports for a source and removes
// its output directories from disk. The DB rows are left for the caller to
// delete (which cascades to jobs, exports, etc.).
func cleanupSourceResources(ctx context.Context, db *sql.DB, mgr *job.Manager, dataDir string, sourceID int64) {
	// 1. Stop active jobs (running/paused/pending have live goroutines).
	jobs, err := models.ListJobs(ctx, db, "", &sourceID)
	if err == nil {
		for _, j := range jobs {
			if j.Status == "running" || j.Status == "paused" || j.Status == "pending" {
				_ = mgr.StopJob(ctx, j.ID)
			}
		}
	}

	// 2. Cancel and remove export files.
	exports, err := models.ListExportsBySource(ctx, db, sourceID)
	if err == nil {
		for _, e := range exports {
			if e.Status == "processing" || e.Status == "pending" {
				_ = mgr.CancelExport(ctx, e.ID)
			}
			if e.FilePath != "" {
				_ = os.Remove(e.FilePath)
			}
		}
	}

	// 3. Delete output directories.
	outputs, err := models.ListOutputsBySource(ctx, db, sourceID)
	if err == nil {
		for _, o := range outputs {
			_ = os.RemoveAll(media.OutputDir(dataDir, o.ID))
		}
	}
}
