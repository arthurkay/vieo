package models

import (
	"context"
	"database/sql"
	"fmt"
)

type Output struct {
	ID        int64  `json:"id"`
	SourceID  int64  `json:"source_id"`
	Type      string `json:"type"`
	Path      string `json:"path"`
	CreatedAt string `json:"created_at"`
}

func ListOutputs(ctx context.Context, db *sql.DB) ([]Output, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, type, path, created_at FROM outputs ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("list outputs: %w", err)
	}
	defer rows.Close()

	var outputs []Output
	for rows.Next() {
		var o Output
		if err := rows.Scan(&o.ID, &o.SourceID, &o.Type, &o.Path, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan output: %w", err)
		}
		outputs = append(outputs, o)
	}
	return outputs, rows.Err()
}

func GetOutput(ctx context.Context, db *sql.DB, id int64) (*Output, error) {
	var o Output
	err := db.QueryRowContext(ctx,
		"SELECT id, source_id, type, path, created_at FROM outputs WHERE id = ?", id,
	).Scan(&o.ID, &o.SourceID, &o.Type, &o.Path, &o.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get output: %w", err)
	}
	return &o, nil
}

// ListOutputsBySource returns outputs for a given source, newest first.
func ListOutputsBySource(ctx context.Context, db *sql.DB, sourceID int64) ([]Output, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, type, path, created_at FROM outputs WHERE source_id = ? ORDER BY created_at DESC",
		sourceID,
	)
	if err != nil {
		return nil, fmt.Errorf("list outputs by source: %w", err)
	}
	defer rows.Close()

	var outputs []Output
	for rows.Next() {
		var o Output
		if err := rows.Scan(&o.ID, &o.SourceID, &o.Type, &o.Path, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan output: %w", err)
		}
		outputs = append(outputs, o)
	}
	return outputs, rows.Err()
}

func CreateOutput(ctx context.Context, db *sql.DB, o *Output) error {
	res, err := db.ExecContext(ctx,
		"INSERT INTO outputs (source_id, type, path) VALUES (?, ?, ?)",
		o.SourceID, o.Type, o.Path,
	)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	id, _ := res.LastInsertId()
	o.ID = id
	o.CreatedAt = ""
	return nil
}

func DeleteOutput(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM outputs WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete output: %w", err)
	}
	return nil
}

func GetOutputBySource(ctx context.Context, db *sql.DB, sourceID int64) (*Output, error) {
	var o Output
	err := db.QueryRowContext(ctx,
		"SELECT id, source_id, type, path, created_at FROM outputs WHERE source_id = ? ORDER BY id DESC LIMIT 1", sourceID,
	).Scan(&o.ID, &o.SourceID, &o.Type, &o.Path, &o.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get output by source: %w", err)
	}
	return &o, nil
}

func MarkFilmstripGenerated(ctx context.Context, db *sql.DB, outputID int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE outputs SET filmstrip_generated = 1 WHERE id = ?", outputID,
	)
	if err != nil {
		return fmt.Errorf("mark filmstrip generated: %w", err)
	}
	return nil
}

func ListOutputsWithoutFilmstrip(ctx context.Context, db *sql.DB) ([]Output, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, source_id, type, path, created_at
		 FROM outputs
		 WHERE filmstrip_generated = 0
		 ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list outputs without filmstrip: %w", err)
	}
	defer rows.Close()

	var outputs []Output
	for rows.Next() {
		var o Output
		if err := rows.Scan(&o.ID, &o.SourceID, &o.Type, &o.Path, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan output: %w", err)
		}
		outputs = append(outputs, o)
	}
	return outputs, rows.Err()
}
