package handler

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"

	"github.com/arthur/vieo/internal/camera"
)

// ListDevices returns the local V4L2 capture devices discovered on the host
// running the backend. On non-Linux platforms this returns an empty list
// (V4L2 is Linux-only).
func ListDevices() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var devices []camera.V4L2Device
		if runtime.GOOS == "linux" {
			devices = camera.DiscoverV4L2()
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"devices":   devices,
			"count":     len(devices),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
}
