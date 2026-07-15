package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"

	"github.com/arthur/vieo/internal/camera"
	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/media"
	"github.com/go-chi/chi/v5"
)

type discoverRequest struct {
	Timeout  int    `json:"timeout"`  // seconds, default 10
	Username string `json:"username"` // optional ONVIF credentials
	Password string `json:"password"`
}

// DiscoverCameras triggers an ONVIF WS-Discovery scan of the local network and
// returns the IP cameras found, each resolved to its RTSP stream URI.
func DiscoverCameras() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req discoverRequest
		_ = json.NewDecoder(r.Body).Decode(&req)

		timeout := time.Duration(req.Timeout) * time.Second
		ctx, cancel := context.WithTimeout(r.Context(), timeout+5*time.Second)
		defer cancel()

		cameras, err := camera.DiscoverONVIFCameras(ctx, timeout, req.Username, req.Password)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if cameras == nil {
			cameras = []camera.ONVIFCamera{}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"cameras": cameras,
			"count":   len(cameras),
		})
	}
}

// GetCameraSnapshot captures a single frame from a source's stream and returns
// it as a JPEG. The source is looked up by id.
func GetCameraSnapshot(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Recover from any panic so a bug here aborts the request with a clean
		// 500 instead of resetting the TCP connection (which surfaces as
		// ECONNRESET on the reverse proxy).
		defer func() {
			if rec := recover(); rec != nil {
				writeJSONError(w, http.StatusInternalServerError, "internal error")
			}
		}()

		idStr := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid id")
			return
		}

		source, err := models.GetSource(r.Context(), db, id)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "source not found")
			return
		}

		// Skip the work entirely if the client already disconnected.
		if r.Context().Err() != nil {
			return
		}

		tmpDir := os.TempDir()
		snapPath := filepath.Join(tmpDir, fmt.Sprintf("vieo_snap_%d.jpg", id))

		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()

		if err := media.CaptureStreamSnapshot(ctx, source.URL, snapPath); err != nil {
			// If the client gave up while we were capturing, just stop.
			if ctx.Err() != nil {
				return
			}
			writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("snapshot failed: %v", err))
			return
		}
		defer os.Remove(snapPath)

		data, err := os.ReadFile(snapPath)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "read snapshot: "+err.Error())
			return
		}

		// Only serve the frame if ffmpeg actually produced a valid JPEG.
		if len(data) < 2 || data[0] != 0xFF || data[1] != 0xD8 {
			writeJSONError(w, http.StatusBadGateway, "snapshot produced no valid image")
			return
		}

		// Guard against broken-pipe errors when the client disconnected.
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(data)
	}
}

type cameraStatus struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	URL       string `json:"url"`
	Status    string `json:"status"` // online | recording | offline | error
	LastSeen  string `json:"last_seen,omitempty"`
	JobStatus string `json:"job_status,omitempty"`
	JobID     int64  `json:"job_id,omitempty"`
	OutputID  int64  `json:"output_id,omitempty"`
}

// GetCameraStatus returns the health status of all camera-type sources
// (device, rtsp, rtmp). A source with a running job is "recording"; one whose
// output directory has a recent segment is "online"; otherwise "offline".
func GetCameraStatus(db *sql.DB, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sources, err := models.ListSources(r.Context(), db, nil)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}

		cameraTypes := map[string]bool{"device": true, "rtsp": true, "rtmp": true}
		jobs, _ := models.ListJobs(r.Context(), db, "", nil)

		jobByOutput := map[int64]models.Job{}
		for _, j := range jobs {
			// Keep the most recent job for each output.
			if existing, ok := jobByOutput[j.OutputID]; !ok || j.ID > existing.ID {
				jobByOutput[j.OutputID] = j
			}
		}

		var statuses []cameraStatus
		for _, s := range sources {
			if !cameraTypes[s.Type] {
				continue
			}
			st := cameraStatus{
				ID:     s.ID,
				Name:   s.Name,
				Type:   s.Type,
				URL:    s.URL,
				Status: "offline",
			}

			outputs, _ := models.ListOutputsBySource(r.Context(), db, s.ID)
			if len(outputs) > 0 {
				out := outputs[0]
				st.OutputID = out.ID
				if job, ok := jobByOutput[out.ID]; ok {
					st.JobStatus = job.Status
					st.JobID = job.ID
				}
				if st.JobStatus == "running" {
					st.Status = "recording"
				} else if media.HasRecentSegments(media.OutputDir(dataDir, out.ID), 30*time.Second) {
					st.Status = "online"
				}
				st.LastSeen = time.Now().UTC().Format(time.RFC3339)
			}

			statuses = append(statuses, st)
		}

		sort.Slice(statuses, func(i, j int) bool { return statuses[i].ID < statuses[j].ID })

		if statuses == nil {
			statuses = []cameraStatus{}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"cameras": statuses,
			"count":   len(statuses),
		})
	}
}
