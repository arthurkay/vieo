package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

type Source struct {
	ID         int64  `json:"id"`
	ChannelID  int64  `json:"channel_id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	URL        string `json:"url"`
	StreamType string `json:"stream_type"`
	Metadata   string `json:"metadata"`
	CreatedAt  string `json:"created_at"`
}

func ListSources(ctx context.Context, db *sql.DB, channelID *int64) ([]Source, error) {
	var rows *sql.Rows
	var err error
	if channelID != nil {
		rows, err = db.QueryContext(ctx,
			"SELECT id, channel_id, name, type, url, stream_type, metadata, created_at FROM sources WHERE channel_id = ? ORDER BY created_at DESC",
			*channelID,
		)
	} else {
		rows, err = db.QueryContext(ctx,
			"SELECT id, channel_id, name, type, url, stream_type, metadata, created_at FROM sources ORDER BY created_at DESC",
		)
	}
	if err != nil {
		return nil, fmt.Errorf("list sources: %w", err)
	}
	defer rows.Close()

	var sources []Source
	for rows.Next() {
		var s Source
		if err := rows.Scan(&s.ID, &s.ChannelID, &s.Name, &s.Type, &s.URL, &s.StreamType, &s.Metadata, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan source: %w", err)
		}
		sources = append(sources, s)
	}
	return sources, rows.Err()
}

func GetSource(ctx context.Context, db *sql.DB, id int64) (*Source, error) {
	var s Source
	err := db.QueryRowContext(ctx,
		"SELECT id, channel_id, name, type, url, stream_type, metadata, created_at FROM sources WHERE id = ?", id,
	).Scan(&s.ID, &s.ChannelID, &s.Name, &s.Type, &s.URL, &s.StreamType, &s.Metadata, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get source: %w", err)
	}
	return &s, nil
}

func CreateSource(ctx context.Context, db *sql.DB, s *Source) error {
	res, err := db.ExecContext(ctx,
		"INSERT INTO sources (channel_id, name, type, url, stream_type, metadata) VALUES (?, ?, ?, ?, ?, ?)",
		s.ChannelID, s.Name, s.Type, s.URL, s.StreamType, s.Metadata,
	)
	if err != nil {
		return fmt.Errorf("create source: %w", err)
	}
	id, _ := res.LastInsertId()
	s.ID = id
	s.CreatedAt = ""
	return nil
}

func UpdateSource(ctx context.Context, db *sql.DB, id int64, name *string) error {
	if name != nil {
		_, err := db.ExecContext(ctx,
			"UPDATE sources SET name = ? WHERE id = ?", *name, id,
		)
		if err != nil {
			return fmt.Errorf("update source: %w", err)
		}
	}
	return nil
}

func DeleteSource(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM sources WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete source: %w", err)
	}
	return nil
}

func UpdateSourceStreamType(ctx context.Context, db *sql.DB, id int64, streamType string) error {
	_, err := db.ExecContext(ctx,
		"UPDATE sources SET stream_type = ? WHERE id = ?", streamType, id,
	)
	if err != nil {
		return fmt.Errorf("update source stream_type: %w", err)
	}
	return nil
}

func UpdateSourceMetadata(ctx context.Context, db *sql.DB, id int64, merge map[string]any) error {
	s, err := GetSource(ctx, db, id)
	if err != nil {
		return fmt.Errorf("get source for metadata update: %w", err)
	}

	var current map[string]any
	if s.Metadata != "" {
		if err := json.Unmarshal([]byte(s.Metadata), &current); err != nil {
			current = make(map[string]any)
		}
	} else {
		current = make(map[string]any)
	}

	for k, v := range merge {
		current[k] = v
	}

	merged, _ := json.Marshal(current)
	_, err = db.ExecContext(ctx,
		"UPDATE sources SET metadata = ? WHERE id = ?", string(merged), id,
	)
	if err != nil {
		return fmt.Errorf("update source metadata: %w", err)
	}
	return nil
}
