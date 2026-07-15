package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestForeignKeysEnabledAndCascade(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	defer os.Remove(path)

	db, err := Open(context.Background(), path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	var fk int
	if err := db.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		t.Fatalf("pragma: %v", err)
	}
	if fk != 1 {
		t.Fatalf("foreign_keys expected 1, got %d", fk)
	}

	// Create channel -> source -> output -> job
	_, err = db.Exec("INSERT INTO channels (name, slug) VALUES ('c','c1')")
	if err != nil {
		t.Fatalf("channel: %v", err)
	}
	_, err = db.Exec("INSERT INTO sources (channel_id, type, url) VALUES (1, 'file', 'x')")
	if err != nil {
		t.Fatalf("source: %v", err)
	}
	_, err = db.Exec("INSERT INTO outputs (source_id, type, path) VALUES (1, 'hls', 'p')")
	if err != nil {
		t.Fatalf("output: %v", err)
	}
	_, err = db.Exec("INSERT INTO jobs (source_id, output_id, status) VALUES (1, 1, 'running')")
	if err != nil {
		t.Fatalf("job: %v", err)
	}
	// Schedule referencing the job via current_job_id (no ON DELETE CASCADE).
	_, err = db.Exec("INSERT INTO schedules (source_id, start_time, current_job_id) VALUES (1, '09:00', 1)")
	if err != nil {
		t.Fatalf("schedule: %v", err)
	}

	// Delete channel; cascade should remove source, output, job
	_, err = db.Exec("DELETE FROM channels WHERE id = 1")
	if err != nil {
		t.Fatalf("delete channel: %v", err)
	}

	var cnt int
	db.QueryRow("SELECT COUNT(*) FROM sources").Scan(&cnt)
	if cnt != 0 {
		t.Fatalf("sources should be 0 after channel delete, got %d", cnt)
	}
	db.QueryRow("SELECT COUNT(*) FROM outputs").Scan(&cnt)
	if cnt != 0 {
		t.Fatalf("outputs should be 0 after channel delete, got %d", cnt)
	}
	db.QueryRow("SELECT COUNT(*) FROM jobs").Scan(&cnt)
	if cnt != 0 {
		t.Fatalf("jobs should be 0 after channel delete, got %d", cnt)
	}
}

func TestForeignKeysViaRawDriver(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test2.db")
	conn, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer conn.Close()
	var fk int
	conn.QueryRow("PRAGMA foreign_keys").Scan(&fk)
	if fk != 1 {
		t.Fatalf("expected fk=1 from DSN pragma, got %d", fk)
	}
}
