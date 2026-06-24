package config

import (
	"flag"
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DBPath    string
	DataDir   string
	HTTPAddr  string
	LogLevel  string
	DiskWarn  int
	DiskCrit  int
	MaxJobs   int
}

func Load() (*Config, error) {
	c := &Config{}

	flag.StringVar(&c.DBPath, "db", envStr("VIEO_DB_PATH", "./vieo.db"), "SQLite database path")
	flag.StringVar(&c.DataDir, "data-dir", envStr("VIEO_DATA_DIR", "./data"), "HLS output directory")
	flag.StringVar(&c.HTTPAddr, "http-addr", envStr("VIEO_HTTP_ADDR", ":8080"), "HTTP server address")
	flag.StringVar(&c.LogLevel, "log-level", envStr("VIEO_LOG_LEVEL", "info"), "Log level (debug, info, warn, error)")
	flag.IntVar(&c.DiskWarn, "disk-warn", envInt("VIEO_DISK_WARN", 90), "Disk usage % to pause jobs")
	flag.IntVar(&c.DiskCrit, "disk-crit", envInt("VIEO_DISK_CRIT", 95), "Disk usage % to stop jobs")
	flag.IntVar(&c.MaxJobs, "max-jobs", envInt("VIEO_MAX_JOBS", 3), "Maximum concurrent transcoding jobs")
	flag.Parse()

	if c.DiskWarn <= 0 || c.DiskWarn > 100 {
		return nil, fmt.Errorf("disk-warn must be between 1 and 100")
	}
	if c.DiskCrit <= 0 || c.DiskCrit > 100 {
		return nil, fmt.Errorf("disk-crit must be between 1 and 100")
	}
	if c.DiskCrit <= c.DiskWarn {
		return nil, fmt.Errorf("disk-crit must be greater than disk-warn")
	}
	if c.MaxJobs < 1 {
		return nil, fmt.Errorf("max-jobs must be at least 1")
	}

	return c, nil
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return def
}
