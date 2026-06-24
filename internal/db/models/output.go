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
