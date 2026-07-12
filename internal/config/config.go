package config

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	DBPath      string
	DataDir     string
	HTTPAddr    string
	LogLevel    string
	DiskWarn    int
	DiskCrit    int
	MaxJobs     int
	Watermark   bool
	JWTSecret   string
	AuthEnabled bool
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
	flag.BoolVar(&c.Watermark, "watermark", envBool("VIEO_WATERMARK", true), "Enable watermark overlay on video streams")
	flag.StringVar(&c.JWTSecret, "jwt-secret", envStr("VIEO_JWT_SECRET", ""), "JWT signing secret (auto-generated if empty)")
	flag.BoolVar(&c.AuthEnabled, "auth", envBool("VIEO_AUTH_ENABLED", true), "Enable authentication")
	flag.Parse()

	if c.JWTSecret == "" {
		secretFile := filepath.Join(c.DataDir, ".jwt_secret")
		data, err := os.ReadFile(secretFile)
		if err == nil && len(data) > 0 {
			c.JWTSecret = string(data)
			log.Printf("loaded JWT secret from %s", secretFile)
		} else {
			b := make([]byte, 32)
			if _, err := rand.Read(b); err != nil {
				return nil, fmt.Errorf("generate jwt secret: %w", err)
			}
			c.JWTSecret = hex.EncodeToString(b)
			if err := os.MkdirAll(c.DataDir, 0755); err != nil {
				log.Printf("warning: could not create data dir for jwt secret: %v", err)
			} else if err := os.WriteFile(secretFile, []byte(c.JWTSecret), 0600); err != nil {
				log.Printf("warning: could not persist jwt secret: %v", err)
			} else {
				log.Printf("generated and persisted JWT secret to %s", secretFile)
			}
		}
	}

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
		if err != nil {
			log.Printf("warning: invalid integer for %s=%q, using default %d", key, v, def)
			return def
		}
		return n
	}
	return def
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			log.Printf("warning: invalid boolean for %s=%q, using default %v", key, v, def)
			return def
		}
		return b
	}
	return def
}
