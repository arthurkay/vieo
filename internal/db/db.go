package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

var migrations = []string{
	`CREATE TABLE IF NOT EXISTS channels (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT    NOT NULL,
		slug       TEXT    NOT NULL UNIQUE,
		description TEXT   NOT NULL DEFAULT '',
		created_at TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS sources (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
		type        TEXT    NOT NULL CHECK(type IN ('file','rtmp','rtsp','device','hls')),
		url         TEXT    NOT NULL,
		stream_type TEXT    NOT NULL DEFAULT 'audio_video' CHECK(stream_type IN ('audio_video','audio_only','video_only')),
		metadata    TEXT    NOT NULL DEFAULT '{}',
		created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS outputs (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
		type       TEXT    NOT NULL DEFAULT 'hls',
		path       TEXT    NOT NULL,
		created_at TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS jobs (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
		output_id  INTEGER NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
		status     TEXT    NOT NULL DEFAULT 'pending'
					CHECK(status IN ('pending','running','paused','completed','failed','stopped')),
		progress   REAL    NOT NULL DEFAULT 0.0,
		error_msg  TEXT    NOT NULL DEFAULT '',
		pid        INTEGER NOT NULL DEFAULT 0,
		created_at TEXT    NOT NULL DEFAULT (datetime('now')),
		ended_at   TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS job_logs (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		level      TEXT    NOT NULL DEFAULT 'info',
		message    TEXT    NOT NULL,
		created_at TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE INDEX IF NOT EXISTS idx_sources_channel ON sources(channel_id)`,
	`CREATE INDEX IF NOT EXISTS idx_outputs_source ON outputs(source_id)`,
	`CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source_id)`,
	`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
	`CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id)`,
	`CREATE TABLE IF NOT EXISTS users (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		username      TEXT    NOT NULL UNIQUE,
		password_hash TEXT    NOT NULL,
		role          TEXT    NOT NULL DEFAULT 'guest' CHECK(role IN ('admin','guest')),
		created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE TABLE IF NOT EXISTS schedules (
		id              INTEGER PRIMARY KEY AUTOINCREMENT,
		source_id       INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
		name            TEXT    NOT NULL DEFAULT '',
		enabled         INTEGER NOT NULL DEFAULT 1,
		start_time      TEXT    NOT NULL,
		end_time        TEXT,
		days_of_week    TEXT    NOT NULL DEFAULT '',
		current_job_id  INTEGER REFERENCES jobs(id),
		last_started    TEXT,
		created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE INDEX IF NOT EXISTS idx_schedules_source ON schedules(source_id)`,
}

type DB struct {
	*sql.DB
}

func Open(ctx context.Context, path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	conn.SetConnMaxLifetime(time.Hour)

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	db := &DB{conn}
	if err := db.migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (db *DB) migrate(ctx context.Context) error {
	for i, m := range migrations {
		if _, err := db.ExecContext(ctx, m); err != nil {
			return fmt.Errorf("migration %d: %w", i, err)
		}
	}
	// Idempotent ALTER TABLE for existing DBs — skip if column exists
	var hasCol int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pragma_table_info('sources') WHERE name='stream_type'").Scan(&hasCol); err != nil {
		log.Printf("check stream_type column: %v", err)
		hasCol = 1 // assume column exists to avoid destructive ALTER
	}
	if hasCol == 0 {
		if _, err := db.ExecContext(ctx,
			"ALTER TABLE sources ADD COLUMN stream_type TEXT NOT NULL DEFAULT 'audio_video' CHECK(stream_type IN ('audio_video','audio_only','video_only'))",
		); err != nil {
			return fmt.Errorf("add stream_type column: %w", err)
		}
	}
	// Add public column to channels if missing
	var hasPublic int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pragma_table_info('channels') WHERE name='public'").Scan(&hasPublic); err != nil {
		log.Printf("check public column: %v", err)
		hasPublic = 1
	}
	if hasPublic == 0 {
		if _, err := db.ExecContext(ctx,
			"ALTER TABLE channels ADD COLUMN public INTEGER NOT NULL DEFAULT 0",
		); err != nil {
			return fmt.Errorf("add public column: %w", err)
		}
	}
	// Add name column to sources if missing
	var hasName int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pragma_table_info('sources') WHERE name='name'").Scan(&hasName); err != nil {
		log.Printf("check name column: %v", err)
		hasName = 1
	}
	if hasName == 0 {
		if _, err := db.ExecContext(ctx,
			"ALTER TABLE sources ADD COLUMN name TEXT NOT NULL DEFAULT ''",
		); err != nil {
			return fmt.Errorf("add name column: %w", err)
		}
	}
	return nil
}
