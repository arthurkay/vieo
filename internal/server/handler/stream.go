package handler

import (
	"bufio"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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

		filePath = filepath.Base(filePath)

		fullPath := filepath.Join(media.OutputDir(dataDir, id), filePath)

		ext := strings.ToLower(filepath.Ext(filePath))
		switch ext {
		case ".m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		case ".ts":
			w.Header().Set("Content-Type", "video/mp2t")
			if isLivePlaylist(media.OutputDir(dataDir, id)) {
				w.Header().Set("Cache-Control", "public, max-age=5")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=3600")
			}
		case ".jpg", ".jpeg":
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
		case ".vtt":
			w.Header().Set("Content-Type", "text/vtt")
			if isLivePlaylist(media.OutputDir(dataDir, id)) {
				w.Header().Set("Cache-Control", "public, max-age=5")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=3600")
			}
		case ".json":
			w.Header().Set("Content-Type", "application/json")
			if isLivePlaylist(media.OutputDir(dataDir, id)) {
				w.Header().Set("Cache-Control", "public, max-age=5")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=3600")
			}
		default:
			http.Error(w, "unsupported file type", http.StatusBadRequest)
			return
		}

		http.ServeFile(w, r, fullPath)
	}
}

type liveCacheEntry struct {
	isLive   bool
	checkedAt time.Time
}

var liveCache sync.Map // map[string]liveCacheEntry

func isLivePlaylist(outputDir string) bool {
	if cached, ok := liveCache.Load(outputDir); ok {
		entry := cached.(liveCacheEntry)
		if time.Since(entry.checkedAt) < 5*time.Second {
			return entry.isLive
		}
	}

	playlistPath := filepath.Join(outputDir, "playlist.m3u8")
	f, err := os.Open(playlistPath)
	if err != nil {
		liveCache.Store(outputDir, liveCacheEntry{isLive: false, checkedAt: time.Now()})
		return false
	}
	defer f.Close()

	isLive := true
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "#EXT-X-ENDLIST" {
			isLive = false
			break
		}
	}
	liveCache.Store(outputDir, liveCacheEntry{isLive: isLive, checkedAt: time.Now()})
	return isLive
}
