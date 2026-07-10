package job

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/arthur/vieo/internal/db/models"
)

type Scheduler struct {
	DB      *sql.DB
	DataDir string
	Manager *Manager
}

func NewScheduler(database *sql.DB, dataDir string, mgr *Manager) *Scheduler {
	return &Scheduler{
		DB:      database,
		DataDir: dataDir,
		Manager: mgr,
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Println("scheduler started")

	for {
		select {
		case <-ctx.Done():
			log.Println("scheduler stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	schedules, err := models.ListEnabledSchedules(ctx, s.DB)
	if err != nil {
		log.Printf("scheduler: list schedules: %v", err)
		return
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	currentTime := now.Format("15:04")
	currentDay := dayOfWeek(now)

	for _, sched := range schedules {
		if err := s.processSchedule(ctx, sched, today, currentTime, currentDay); err != nil {
			log.Printf("scheduler: process schedule %d: %v", sched.ID, err)
		}
	}
}

func (s *Scheduler) processSchedule(ctx context.Context, sched models.Schedule, today, currentTime, currentDay string) error {
	if !s.shouldRunToday(sched.DaysOfWeek, currentDay) {
		return nil
	}

	endTime := ""
	if sched.EndTime != nil {
		endTime = *sched.EndTime
	}

	if !isTimeInRange(sched.StartTime, endTime, currentTime) {
		if sched.CurrentJobID != nil {
			return s.endSchedule(ctx, sched)
		}
		return nil
	}

	if sched.CurrentJobID != nil {
		job, err := models.GetJob(ctx, s.DB, *sched.CurrentJobID)
		if err != nil {
			log.Printf("scheduler: get job %d for schedule %d: %v", *sched.CurrentJobID, sched.ID, err)
			_ = models.ClearScheduleJob(ctx, s.DB, sched.ID)
			return nil
		}
		if job.Status == "running" || job.Status == "pending" {
			return nil
		}
		log.Printf("scheduler: job %d for schedule %d is %s, clearing", job.ID, sched.ID, job.Status)
		_ = models.ClearScheduleJob(ctx, s.DB, sched.ID)
	}

	return s.startSchedule(ctx, sched)
}

func (s *Scheduler) startSchedule(ctx context.Context, sched models.Schedule) error {
	output, err := models.GetOutputBySource(ctx, s.DB, sched.SourceID)
	if err != nil {
		output = &models.Output{
			SourceID: sched.SourceID,
			Type:     "hls",
			Path:     "",
		}
		if err := models.CreateOutput(ctx, s.DB, output); err != nil {
			return fmt.Errorf("create output: %w", err)
		}
	}

	job, err := s.Manager.StartJob(ctx, sched.SourceID, output.ID)
	if err != nil {
		return fmt.Errorf("start job: %w", err)
	}

	if err := models.SetScheduleJob(ctx, s.DB, sched.ID, job.ID); err != nil {
		log.Printf("scheduler: set schedule job: %v", err)
	}

	log.Printf("scheduler: started job %d for schedule %d (source %d)", job.ID, sched.ID, sched.SourceID)
	return nil
}

func (s *Scheduler) endSchedule(ctx context.Context, sched models.Schedule) error {
	job, err := models.GetJob(ctx, s.DB, *sched.CurrentJobID)
	if err != nil {
		log.Printf("scheduler: get current job %d: %v", *sched.CurrentJobID, err)
		_ = models.ClearScheduleJob(ctx, s.DB, sched.ID)
		return nil
	}

	if job.Status == "running" || job.Status == "pending" {
		if err := s.Manager.PauseJob(ctx, job.ID); err != nil {
			log.Printf("scheduler: pause job %d: %v", job.ID, err)
		}
		log.Printf("scheduler: paused job %d for schedule %d (end time reached)", job.ID, sched.ID)
	}

	_ = models.ClearScheduleJob(ctx, s.DB, sched.ID)
	return nil
}

func (s *Scheduler) shouldRunToday(daysOfWeek, currentDay string) bool {
	if daysOfWeek == "" {
		return true
	}
	for _, d := range splitDays(daysOfWeek) {
		if d == currentDay {
			return true
		}
	}
	return false
}

func isTimeInRange(start, end, current string) bool {
	if end == "" {
		return current >= start
	}
	return current >= start && current <= end
}

func dayOfWeek(t time.Time) string {
	return t.Weekday().String()[:3]
}

func splitDays(s string) []string {
	var days []string
	current := ""
	for _, c := range s {
		if c == ',' {
			if current != "" {
				days = append(days, current)
			}
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		days = append(days, current)
	}
	return days
}
