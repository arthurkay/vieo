package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
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
	// Timeline events for player markers
	`CREATE TABLE IF NOT EXISTS timeline_events (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		time_offset REAL NOT NULL,
		label       TEXT NOT NULL,
		color       TEXT NOT NULL DEFAULT '#3b82f6',
		created_at  TEXT NOT NULL DEFAULT (datetime('now'))
	)`,
	`CREATE INDEX IF NOT EXISTS idx_timeline_events_job ON timeline_events(job_id)`,
	// Export clips
	`CREATE TABLE IF NOT EXISTS exports (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		source_id    INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
		output_id    INTEGER NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
		status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
		progress     REAL NOT NULL DEFAULT 0.0,
		start_time   REAL NOT NULL DEFAULT 0.0,
		duration     REAL NOT NULL DEFAULT 0.0,
		file_path    TEXT NOT NULL DEFAULT '',
		file_size    INTEGER NOT NULL DEFAULT 0,
		error_msg    TEXT NOT NULL DEFAULT '',
		created_at   TEXT NOT NULL DEFAULT (datetime('now')),
		completed_at TEXT
	)`,
	`CREATE INDEX IF NOT EXISTS idx_exports_source ON exports(source_id)`,
}

type DB struct {
	*sql.DB
}

func Open(ctx context.Context, path string) (*DB, error) {
	// Enable foreign keys via the DSN so every connection enforces
	// ON DELETE CASCADE constraints (modernc.org/sqlite does not enable them
	// by default). This is what keeps channel/source deletion from orphaning
	// child rows.
	dsn := path
	if strings.Contains(dsn, "?") {
		dsn += "&_pragma=foreign_keys(1)"
	} else {
		dsn += "?_pragma=foreign_keys(1)"
	}

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	conn.SetConnMaxLifetime(time.Hour)

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	// Belt-and-suspenders: ensure the pragma is active on the live connection.
	if _, err := conn.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	db := &DB{conn}
	if err := db.migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (db *DB) migrate(ctx context.Context) error {
	// Schema manipulation (notably the sources-table recreation, which renames
	// and drops tables) must run with foreign keys disabled AND legacy_alter_table
	// enabled. Otherwise modern SQLite rewrites the foreign keys of referencing
	// tables (e.g. outputs) onto the temporary renamed table and breaks
	// subsequent inserts. Restore both afterwards.
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = OFF"); err != nil {
		return fmt.Errorf("disable foreign keys for migration: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA legacy_alter_table = ON"); err != nil {
		return fmt.Errorf("enable legacy alter table for migration: %w", err)
	}
	defer func() {
		db.ExecContext(ctx, "PRAGMA legacy_alter_table = OFF")
		db.ExecContext(ctx, "PRAGMA foreign_keys = ON")
	}()

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
	// Recreate sources table without restrictive CHECK constraint on type
	// to support new source types (udp, rtp, srt)
	var typeCheck string
	if err := db.QueryRowContext(ctx,
		"SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'",
	).Scan(&typeCheck); err == nil && strings.Contains(typeCheck, "CHECK(type IN") {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin tx for sources recreate: %w", err)
		}
		if _, err := tx.ExecContext(ctx, "ALTER TABLE sources RENAME TO sources_old"); err != nil {
			tx.Rollback()
			return fmt.Errorf("rename sources: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `CREATE TABLE sources (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
			type        TEXT    NOT NULL,
			url         TEXT    NOT NULL,
			stream_type TEXT    NOT NULL DEFAULT 'audio_video' CHECK(stream_type IN ('audio_video','audio_only','video_only')),
			metadata    TEXT    NOT NULL DEFAULT '{}',
			name        TEXT    NOT NULL DEFAULT '',
			created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
		)`); err != nil {
			tx.Rollback()
			return fmt.Errorf("create sources table: %w", err)
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO sources (id, channel_id, type, url, stream_type, metadata, name, created_at) SELECT id, channel_id, type, url, stream_type, metadata, name, created_at FROM sources_old",
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("copy sources data: %w", err)
		}
		if _, err := tx.ExecContext(ctx, "DROP TABLE sources_old"); err != nil {
			tx.Rollback()
			return fmt.Errorf("drop sources_old: %w", err)
		}
		if _, err := tx.ExecContext(ctx, "CREATE INDEX IF NOT EXISTS idx_sources_channel ON sources(channel_id)"); err != nil {
			tx.Rollback()
			return fmt.Errorf("recreate sources index: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit sources recreate: %w", err)
		}
		log.Printf("migrated sources table: removed restrictive type CHECK constraint")
	}
	// Add filmstrip_generated column to outputs if missing
	var hasFilmstrip int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pragma_table_info('outputs') WHERE name='filmstrip_generated'").Scan(&hasFilmstrip); err != nil {
		log.Printf("check filmstrip_generated column: %v", err)
		hasFilmstrip = 1
	}
	if hasFilmstrip == 0 {
		if _, err := db.ExecContext(ctx,
			"ALTER TABLE outputs ADD COLUMN filmstrip_generated INTEGER NOT NULL DEFAULT 0",
		); err != nil {
			return fmt.Errorf("add filmstrip_generated column: %w", err)
		}
	}
	return nil
}
