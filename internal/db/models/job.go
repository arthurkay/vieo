package models

import (
	"context"
	"database/sql"
	"fmt"
)

type Job struct {
	ID        int64   `json:"id"`
	SourceID  int64   `json:"source_id"`
	OutputID  int64   `json:"output_id"`
	Status    string  `json:"status"`
	Progress  float64 `json:"progress"`
	ErrorMsg  string  `json:"error_msg"`
	PID       int     `json:"pid"`
	CreatedAt string  `json:"created_at"`
	EndedAt   *string `json:"ended_at,omitempty"`
}

type JobLog struct {
	ID        int64  `json:"id"`
	JobID     int64  `json:"job_id"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

func ListJobs(ctx context.Context, db *sql.DB, status string, sourceID *int64) ([]Job, error) {
	var rows *sql.Rows
	var err error

	switch {
	case status != "" && sourceID != nil:
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs WHERE status = ? AND source_id = ? ORDER BY created_at DESC",
			status, *sourceID,
		)
	case status != "":
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs WHERE status = ? ORDER BY created_at DESC",
			status,
		)
	case sourceID != nil:
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs WHERE source_id = ? ORDER BY created_at DESC",
			*sourceID,
		)
	default:
		rows, err = db.QueryContext(ctx,
			"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs ORDER BY created_at DESC",
		)
	}
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.SourceID, &j.OutputID, &j.Status, &j.Progress, &j.ErrorMsg, &j.PID, &j.CreatedAt, &j.EndedAt); err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

func GetJob(ctx context.Context, db *sql.DB, id int64) (*Job, error) {
	var j Job
	err := db.QueryRowContext(ctx,
		"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs WHERE id = ?", id,
	).Scan(&j.ID, &j.SourceID, &j.OutputID, &j.Status, &j.Progress, &j.ErrorMsg, &j.PID, &j.CreatedAt, &j.EndedAt)
	if err != nil {
		return nil, fmt.Errorf("get job: %w", err)
	}
	return &j, nil
}

func CreateJob(ctx context.Context, db *sql.DB, j *Job) error {
	res, err := db.ExecContext(ctx,
		"INSERT INTO jobs (source_id, output_id, status) VALUES (?, ?, ?)",
		j.SourceID, j.OutputID, j.Status,
	)
	if err != nil {
		return fmt.Errorf("create job: %w", err)
	}
	id, _ := res.LastInsertId()
	j.ID = id
	j.CreatedAt = ""
	return nil
}

func UpdateJobStatus(ctx context.Context, db *sql.DB, id int64, status string, progress float64, errorMsg string) error {
	_, err := db.ExecContext(ctx,
		"UPDATE jobs SET status = ?, progress = ?, error_msg = ?, ended_at = CASE WHEN ? IN ('stopped','paused','completed','failed') THEN datetime('now') ELSE ended_at END WHERE id = ?",
		status, progress, errorMsg, status, id,
	)
	if err != nil {
		return fmt.Errorf("update job status: %w", err)
	}
	return nil
}

func UpdateJobPID(ctx context.Context, db *sql.DB, id int64, pid int) error {
	_, err := db.ExecContext(ctx, "UPDATE jobs SET pid = ? WHERE id = ?", pid, id)
	if err != nil {
		return fmt.Errorf("update job pid: %w", err)
	}
	return nil
}

func CompleteJob(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE jobs SET status = 'completed', progress = 1.0, error_msg = '', ended_at = datetime('now') WHERE id = ?", id,
	)
	if err != nil {
		return fmt.Errorf("complete job: %w", err)
	}
	return nil
}

func FailJob(ctx context.Context, db *sql.DB, id int64, errMsg string) error {
	_, err := db.ExecContext(ctx,
		"UPDATE jobs SET status = 'failed', progress = 0, error_msg = ?, ended_at = datetime('now') WHERE id = ?", errMsg, id,
	)
	if err != nil {
		return fmt.Errorf("fail job: %w", err)
	}
	return nil
}

func DeleteJob(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, "DELETE FROM jobs WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete job: %w", err)
	}
	return nil
}

func ClearJobError(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx,
		"UPDATE jobs SET error_msg = '' WHERE id = ?", id,
	)
	if err != nil {
		return fmt.Errorf("clear job error: %w", err)
	}
	return nil
}

func CreateJobLog(ctx context.Context, db *sql.DB, log *JobLog) error {
	_, err := db.ExecContext(ctx,
		"INSERT INTO job_logs (job_id, level, message) VALUES (?, ?, ?)",
		log.JobID, log.Level, log.Message,
	)
	if err != nil {
		return fmt.Errorf("create job log: %w", err)
	}
	return nil
}

func ListJobLogs(ctx context.Context, db *sql.DB, jobID int64) ([]JobLog, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, job_id, level, message, created_at FROM job_logs WHERE job_id = ? ORDER BY created_at", jobID,
	)
	if err != nil {
		return nil, fmt.Errorf("list job logs: %w", err)
	}
	defer rows.Close()

	var logs []JobLog
	for rows.Next() {
		var l JobLog
		if err := rows.Scan(&l.ID, &l.JobID, &l.Level, &l.Message, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan job log: %w", err)
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

func ListResumableJobs(ctx context.Context, db *sql.DB) ([]Job, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, source_id, output_id, status, progress, error_msg, pid, created_at, ended_at FROM jobs WHERE status IN ('running','paused')",
	)
	if err != nil {
		return nil, fmt.Errorf("list resumable jobs: %w", err)
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.SourceID, &j.OutputID, &j.Status, &j.Progress, &j.ErrorMsg, &j.PID, &j.CreatedAt, &j.EndedAt); err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}
