package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/arthur/vieo/internal/disk"
)

type healthResponse struct {
	Status  string         `json:"status"`
	Version string         `json:"version"`
	Jobs    map[string]int `json:"jobs"`
	Disk    *diskInfo      `json:"disk,omitempty"`
}

type diskInfo struct {
	UsagePercent float64 `json:"usage_percent"`
	TotalGB      float64 `json:"total_gb"`
	FreeGB       float64 `json:"free_gb"`
	Warn         int     `json:"warn"`
	Crit         int     `json:"crit"`
}

func Health(db *sql.DB, dataDir string, diskWarn, diskCrit int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobCounts := map[string]int{"running": 0, "pending": 0, "completed": 0, "failed": 0, "paused": 0, "stopped": 0}

		rows, err := db.QueryContext(r.Context(), "SELECT status, COUNT(*) FROM jobs GROUP BY status")
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var status string
				var count int
				if err := rows.Scan(&status, &count); err == nil {
					jobCounts[status] = count
				}
			}
		}

		resp := healthResponse{
			Status:  "ok",
			Version: "1.0.0",
			Jobs:    jobCounts,
		}

		if usage, totalGB, freeGB, err := disk.Usage(dataDir); err == nil {
			resp.Disk = &diskInfo{
				UsagePercent: usage,
				TotalGB:      totalGB,
				FreeGB:       freeGB,
				Warn:         diskWarn,
				Crit:         diskCrit,
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}
