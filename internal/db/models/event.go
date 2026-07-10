package models

import (
	"context"
	"database/sql"
	"fmt"
)

type TimelineEvent struct {
	ID         int64   `json:"id"`
	JobID      int64   `json:"job_id"`
	TimeOffset float64 `json:"time_offset"`
	Label      string  `json:"label"`
	Color      string  `json:"color"`
	CreatedAt  string  `json:"created_at"`
}

func CreateEvent(ctx context.Context, db *sql.DB, jobID int64, timeOffset float64, label, color string) (*TimelineEvent, error) {
	if color == "" {
		color = "#3b82f6"
	}
	res, err := db.ExecContext(ctx,
		"INSERT INTO timeline_events (job_id, time_offset, label, color) VALUES (?, ?, ?, ?)",
		jobID, timeOffset, label, color,
	)
	if err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}
	id, _ := res.LastInsertId()
	return &TimelineEvent{
		ID:         id,
		JobID:      jobID,
		TimeOffset: timeOffset,
		Label:      label,
		Color:      color,
	}, nil
}

func ListEventsByJob(ctx context.Context, db *sql.DB, jobID int64) ([]TimelineEvent, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, job_id, time_offset, label, color, created_at FROM timeline_events WHERE job_id = ? ORDER BY time_offset",
		jobID,
	)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	var events []TimelineEvent
	for rows.Next() {
		var e TimelineEvent
		if err := rows.Scan(&e.ID, &e.JobID, &e.TimeOffset, &e.Label, &e.Color, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func DeleteEvent(ctx context.Context, db *sql.DB, id int64) error {
	res, err := db.ExecContext(ctx, "DELETE FROM timeline_events WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("event not found")
	}
	return nil
}
