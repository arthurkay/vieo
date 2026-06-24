package handler

import (
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/arthur/vieo/internal/media"
	"github.com/go-chi/chi/v5"
)

func StreamHLS(dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	filePath := chi.URLParam(r, "*")
		if filePath == "" {
			filePath = "playlist.m3u8"
		}

		// Prevent path traversal
		filePath = filepath.Base(filePath)

		fullPath := filepath.Join(media.OutputDir(dataDir, id), filePath)

		ext := strings.ToLower(filepath.Ext(filePath))
		switch ext {
		case ".m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Header().Set("Cache-Control", "no-cache")
		case ".ts":
			w.Header().Set("Content-Type", "video/mp2t")
			w.Header().Set("Cache-Control", "public, max-age=3600")
		default:
			http.Error(w, "unsupported file type", http.StatusBadRequest)
			return
		}

		http.ServeFile(w, r, fullPath)
	}
}
