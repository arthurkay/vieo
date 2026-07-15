package models

import (
	"context"
	"database/sql"
	"fmt"
)

type Export struct {
	ID          int64   `json:"id"`
	SourceID    int64   `json:"source_id"`
	OutputID    int64   `json:"output_id"`
	Status      string  `json:"status"`
	Progress    float64 `json:"progress"`
	StartTime   float64 `json:"start_time"`
	Duration    float64 `json:"duration"`
	FilePath    string  `json:"file_path"`
	FileSize    int64   `json:"file_size"`
	ErrorMsg    string  `json:"error_msg"`
	CreatedAt   string  `json:"created_at"`
	CompletedAt *string `json:"completed_at,omitempty"`
}

func CreateExport(ctx context.Context, db *sql.DB, sourceID, outputID int64, startTime, duration float64) (*Export, error) {
	res, err := db.ExecContext(ctx,
		"INSERT INTO exports (source_id, output_id, start_time, duration) VALUES (?, ?, ?, ?)",
		sourceID, outputID, startTime, duration,
	)
	if err != nil {
		return nil, fmt.Errorf("create export: %w", err)
	}
	id, _ := res.LastInsertId()
	return &Export{
		ID:        id,
		SourceID:  sourceID,
		OutputID:  outputID,
		Status:    "pending",
		StartTime: startTime,
		Duration:  duration,
	}, nil
}

func ListExports(ctx context.Context, db *sql.DB) ([]Export, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, output_id, status, progress, start_time, duration, file_path, file_size, error_msg, created_at, completed_at FROM exports ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("list exports: %w", err)
	}
	defer rows.Close()

	var exports []Export
	for rows.Next() {
		var e Export
		if err := rows.Scan(&e.ID, &e.SourceID, &e.OutputID, &e.Status, &e.Progress, &e.StartTime, &e.Duration, &e.FilePath, &e.FileSize, &e.ErrorMsg, &e.CreatedAt, &e.CompletedAt); err != nil {
			return nil, fmt.Errorf("scan export: %w", err)
		}
		exports = append(exports, e)
	}
	return exports, rows.Err()
}

func GetExport(ctx context.Context, db *sql.DB, id int64) (*Export, error) {
	var e Export
	err := db.QueryRowContext(ctx,
		"SELECT id, source_id, output_id, status, progress, start_time, duration, file_path, file_size, error_msg, created_at, completed_at FROM exports WHERE id = ?", id,
	).Scan(&e.ID, &e.SourceID, &e.OutputID, &e.Status, &e.Progress, &e.StartTime, &e.Duration, &e.FilePath, &e.FileSize, &e.ErrorMsg, &e.CreatedAt, &e.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("get export: %w", err)
	}
	return &e, nil
}

func ListExportsBySource(ctx context.Context, db *sql.DB, sourceID int64) ([]Export, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, output_id, status, progress, start_time, duration, file_path, file_size, error_msg, created_at, completed_at FROM exports WHERE source_id = ? ORDER BY created_at DESC",
		sourceID,
	)
	if err != nil {
		return nil, fmt.Errorf("list exports by source: %w", err)
	}
	defer rows.Close()

	var exports []Export
	for rows.Next() {
		var e Export
		if err := rows.Scan(&e.ID, &e.SourceID, &e.OutputID, &e.Status, &e.Progress, &e.StartTime, &e.Duration, &e.FilePath, &e.FileSize, &e.ErrorMsg, &e.CreatedAt, &e.CompletedAt); err != nil {
			return nil, fmt.Errorf("scan export: %w", err)
		}
		exports = append(exports, e)
	}
	return exports, rows.Err()
}

func UpdateExportStatus(ctx context.Context, db *sql.DB, id int64, status string, progress float64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE exports SET status = ?, progress = ? WHERE id = ?",
		status, progress, id,
	)
	if err != nil {
		return fmt.Errorf("update export status: %w", err)
	}
	return nil
}

func CompleteExport(ctx context.Context, db *sql.DB, id int64, filePath string, fileSize int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE exports SET status = 'completed', progress = 1.0, file_path = ?, file_size = ?, completed_at = datetime('now') WHERE id = ?",
		filePath, fileSize, id,
	)
	if err != nil {
		return fmt.Errorf("complete export: %w", err)
	}
	return nil
}

func FailExport(ctx context.Context, db *sql.DB, id int64, errorMsg string) error {
	_, err := db.ExecContext(ctx,
		"UPDATE exports SET status = 'failed', error_msg = ? WHERE id = ?",
		errorMsg, id,
	)
	if err != nil {
		return fmt.Errorf("fail export: %w", err)
	}
	return nil
}

func DeleteExport(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM exports WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete export: %w", err)
	}
	return nil
}
