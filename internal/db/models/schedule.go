package models

import (
	"context"
	"database/sql"
	"fmt"
)

type Schedule struct {
	ID           int64   `json:"id"`
	SourceID     int64   `json:"source_id"`
	Name         string  `json:"name"`
	Enabled      bool    `json:"enabled"`
	StartTime    string  `json:"start_time"`
	EndTime      *string `json:"end_time"`
	DaysOfWeek   string  `json:"days_of_week"`
	CurrentJobID *int64  `json:"current_job_id"`
	LastStarted  *string `json:"last_started"`
	CreatedAt    string  `json:"created_at"`
}

func ListSchedules(ctx context.Context, db *sql.DB, sourceID *int64) ([]Schedule, error) {
	var rows *sql.Rows
	var err error
	if sourceID != nil {
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, name, enabled, start_time, end_time, days_of_week, current_job_id, last_started, created_at FROM schedules WHERE source_id = ? ORDER BY start_time",
			*sourceID,
		)
	} else {
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, name, enabled, start_time, end_time, days_of_week, current_job_id, last_started, created_at FROM schedules ORDER BY start_time",
		)
	}
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var s Schedule
		var enabled int
		if err := rows.Scan(&s.ID, &s.SourceID, &s.Name, &enabled, &s.StartTime, &s.EndTime, &s.DaysOfWeek, &s.CurrentJobID, &s.LastStarted, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		s.Enabled = enabled == 1
		schedules = append(schedules, s)
	}
	return schedules, rows.Err()
}

func GetSchedule(ctx context.Context, db *sql.DB, id int64) (*Schedule, error) {
	var s Schedule
	var enabled int
	err := db.QueryRowContext(ctx,
		"SELECT id, source_id, name, enabled, start_time, end_time, days_of_week, current_job_id, last_started, created_at FROM schedules WHERE id = ?", id,
	).Scan(&s.ID, &s.SourceID, &s.Name, &enabled, &s.StartTime, &s.EndTime, &s.DaysOfWeek, &s.CurrentJobID, &s.LastStarted, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get schedule: %w", err)
	}
	s.Enabled = enabled == 1
	return &s, nil
}

func CreateSchedule(ctx context.Context, db *sql.DB, s *Schedule) error {
	enabled := 0
	if s.Enabled {
		enabled = 1
	}
	res, err := db.ExecContext(ctx,
		"INSERT INTO schedules (source_id, name, enabled, start_time, end_time, days_of_week) VALUES (?, ?, ?, ?, ?, ?)",
		s.SourceID, s.Name, enabled, s.StartTime, s.EndTime, s.DaysOfWeek,
	)
	if err != nil {
		return fmt.Errorf("create schedule: %w", err)
	}
	id, _ := res.LastInsertId()
	s.ID = id
	s.CreatedAt = ""
	return nil
}

func UpdateSchedule(ctx context.Context, db *sql.DB, s *Schedule) error {
	enabled := 0
	if s.Enabled {
		enabled = 1
	}
	_, err := db.ExecContext(ctx,
		"UPDATE schedules SET name = ?, enabled = ?, start_time = ?, end_time = ?, days_of_week = ? WHERE id = ?",
		s.Name, enabled, s.StartTime, s.EndTime, s.DaysOfWeek, s.ID,
	)
	if err != nil {
		return fmt.Errorf("update schedule: %w", err)
	}
	return nil
}

func DeleteSchedule(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM schedules WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete schedule: %w", err)
	}
	return nil
}

func ListEnabledSchedules(ctx context.Context, db *sql.DB) ([]Schedule, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, name, enabled, start_time, end_time, days_of_week, current_job_id, last_started, created_at FROM schedules WHERE enabled = 1",
	)
	if err != nil {
		return nil, fmt.Errorf("list enabled schedules: %w", err)
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var s Schedule
		if err := rows.Scan(&s.ID, &s.SourceID, &s.Name, &s.Enabled, &s.StartTime, &s.EndTime, &s.DaysOfWeek, &s.CurrentJobID, &s.LastStarted, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		s.Enabled = true
		schedules = append(schedules, s)
	}
	return schedules, rows.Err()
}

func SetScheduleJob(ctx context.Context, db *sql.DB, scheduleID, jobID int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE schedules SET current_job_id = ?, last_started = datetime('now') WHERE id = ?",
		jobID, scheduleID,
	)
	if err != nil {
		return fmt.Errorf("set schedule job: %w", err)
	}
	return nil
}

func ClearScheduleJob(ctx context.Context, db *sql.DB, scheduleID int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE schedules SET current_job_id = NULL WHERE id = ?",
		scheduleID,
	)
	if err != nil {
		return fmt.Errorf("clear schedule job: %w", err)
	}
	return nil
}
