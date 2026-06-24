package models

import (
	"context"
	"database/sql"
	"fmt"
)

type Channel struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

func ListChannels(ctx context.Context, db *sql.DB) ([]Channel, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, name, slug, description, created_at FROM channels ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var c Channel
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan channel: %w", err)
		}
		channels = append(channels, c)
	}
	return channels, rows.Err()
}

func GetChannel(ctx context.Context, db *sql.DB, id int64) (*Channel, error) {
	var c Channel
	err := db.QueryRowContext(ctx,
		"SELECT id, name, slug, description, created_at FROM channels WHERE id = ?", id,
	).Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get channel: %w", err)
	}
	return &c, nil
}

func CreateChannel(ctx context.Context, db *sql.DB, c *Channel) error {
	res, err := db.ExecContext(ctx,
		"INSERT INTO channels (name, slug, description) VALUES (?, ?, ?)",
		c.Name, c.Slug, c.Description,
	)
	if err != nil {
		return fmt.Errorf("create channel: %w", err)
	}
	id, _ := res.LastInsertId()
	c.ID = id
	c.CreatedAt = ""
	return nil
}

func UpdateChannel(ctx context.Context, db *sql.DB, c *Channel) error {
	_, err := db.ExecContext(ctx,
		"UPDATE channels SET name = ?, slug = ?, description = ? WHERE id = ?",
		c.Name, c.Slug, c.Description, c.ID,
	)
	if err != nil {
		return fmt.Errorf("update channel: %w", err)
	}
	return nil
}

func DeleteChannel(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM channels WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete channel: %w", err)
	}
	return nil
}
