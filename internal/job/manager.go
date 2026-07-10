package job

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/media"
)

type EventType string

const (
	EventUpdate   EventType = "job:update"
	EventLog      EventType = "job:log"
	EventComplete EventType = "job:complete"
	EventError    EventType = "job:error"
	EventPaused   EventType = "job:paused"
)

type JobEvent struct {
	Type    EventType `json:"type"`
	Payload any       `json:"payload"`
}

type Manager struct {
	DB       *sql.DB
	DataDir  string
	MaxJobs  int
	DiskWarn int
	DiskCrit int

	mu      sync.Mutex
	running map[int64]context.CancelFunc
	sem     chan struct{}
	events  chan JobEvent
	wg      sync.WaitGroup
}

func NewManager(db *sql.DB, dataDir string, maxJobs, diskWarn, diskCrit int) *Manager {
	return &Manager{
		DB:       db,
		DataDir:  dataDir,
		MaxJobs:  maxJobs,
		DiskWarn: diskWarn,
		DiskCrit: diskCrit,
		running:  make(map[int64]context.CancelFunc),
		sem:      make(chan struct{}, maxJobs),
		events:   make(chan JobEvent, 100),
	}
}

func (m *Manager) Events() <-chan JobEvent {
	return m.events
}

func (m *Manager) emit(evt JobEvent) {
	select {
	case m.events <- evt:
	default:
	}
}

func (m *Manager) Wait() {
	m.wg.Wait()
}

func (m *Manager) ResumeJobs(ctx context.Context) error {
	jobs, err := models.ListResumableJobs(ctx, m.DB)
	if err != nil {
		return fmt.Errorf("list resumable: %w", err)
	}

	for _, j := range jobs {
		log.Printf("resuming job %d (was %s)", j.ID, j.Status)
		if err := models.UpdateJobStatus(ctx, m.DB, j.ID, "pending", 0, ""); err != nil {
			log.Printf("reset job %d: %v", j.ID, err)
			continue
		}
		go m.runJob(context.Background(), j.ID, j.SourceID, j.OutputID, 0)
	}

	return nil
}

func (m *Manager) StartJob(ctx context.Context, sourceID, outputID int64) (*models.Job, error) {
	job := &models.Job{
		SourceID: sourceID,
		OutputID: outputID,
		Status:   "pending",
	}

	if err := models.CreateJob(ctx, m.DB, job); err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	go m.runJob(context.Background(), job.ID, sourceID, outputID, 0)

	return job, nil
}

func (m *Manager) StopJob(ctx context.Context, jobID int64) error {
	m.mu.Lock()
	cancel, ok := m.running[jobID]
	m.mu.Unlock()

	if ok {
		cancel()
	}

	job, err := models.GetJob(ctx, m.DB, jobID)
	if err == nil && job.OutputID > 0 {
		outputDir := media.OutputDir(m.DataDir, job.OutputID)
		if err := media.FinalizePlaylist(outputDir); err != nil {
			log.Printf("finalize playlist job %d: %v", jobID, err)
		}
	}

	return models.UpdateJobStatus(ctx, m.DB, jobID, "stopped", 0, "stopped by user")
}

func (m *Manager) PauseJob(ctx context.Context, jobID int64) error {
	m.mu.Lock()
	cancel, ok := m.running[jobID]
	m.mu.Unlock()

	if ok {
		cancel()
	}

	job, err := models.GetJob(ctx, m.DB, jobID)
	if err == nil && job.OutputID > 0 {
		outputDir := media.OutputDir(m.DataDir, job.OutputID)
		if err := media.FinalizePlaylist(outputDir); err != nil {
			log.Printf("finalize playlist job %d: %v", jobID, err)
		}
	}

	return models.UpdateJobStatus(ctx, m.DB, jobID, "paused", 0, "paused by user")
}

func (m *Manager) RetryJob(ctx context.Context, jobID int64) error {
	job, err := models.GetJob(ctx, m.DB, jobID)
	if err != nil {
		return fmt.Errorf("get job: %w", err)
	}

	if job.Status != "failed" && job.Status != "stopped" && job.Status != "completed" {
		return fmt.Errorf("can only continue failed, stopped, or completed jobs")
	}

	source, err := models.GetSource(ctx, m.DB, job.SourceID)
	if err != nil {
		return fmt.Errorf("get source: %w", err)
	}
	if source.Type == "file" {
		return fmt.Errorf("continue not supported for file sources — create a new job instead")
	}

	if err := models.UpdateJobStatus(ctx, m.DB, jobID, "pending", 0, ""); err != nil {
		return err
	}

	_ = models.ClearJobError(ctx, m.DB, jobID)

	outputDir := media.OutputDir(m.DataDir, job.OutputID)
	startNumber, err := media.PrepareResume(outputDir)
	if err != nil {
		log.Printf("prepare continue job %d: %v", jobID, err)
		startNumber = 0
	}

	go m.runJob(context.Background(), jobID, job.SourceID, job.OutputID, startNumber)
	return nil
}

func (m *Manager) ResumePausedJob(ctx context.Context, jobID int64) error {
	job, err := models.GetJob(ctx, m.DB, jobID)
	if err != nil {
		return fmt.Errorf("get job: %w", err)
	}

	if job.Status != "paused" {
		return fmt.Errorf("can only resume paused jobs")
	}

	if err := models.UpdateJobStatus(ctx, m.DB, jobID, "pending", 0, ""); err != nil {
		return err
	}

	_ = models.ClearJobError(ctx, m.DB, jobID)

	outputDir := media.OutputDir(m.DataDir, job.OutputID)
	startNumber, err := media.PrepareResume(outputDir)
	if err != nil {
		log.Printf("prepare resume job %d: %v", jobID, err)
		startNumber = 0
	}

	go m.runJob(context.Background(), jobID, job.SourceID, job.OutputID, startNumber)
	return nil
}

func (m *Manager) StopAll(ctx context.Context) {
	m.mu.Lock()
	ids := make([]int64, 0, len(m.running))
	for id := range m.running {
		ids = append(ids, id)
	}
	for _, id := range ids {
		m.running[id]()
	}
	m.mu.Unlock()

	for _, id := range ids {
		job, err := models.GetJob(ctx, m.DB, id)
		if err == nil && job.OutputID > 0 {
			outputDir := media.OutputDir(m.DataDir, job.OutputID)
			if ferr := media.FinalizePlaylist(outputDir); ferr != nil {
				log.Printf("finalize playlist job %d: %v", id, ferr)
			}
		}

		if err := models.UpdateJobStatus(ctx, m.DB, id, "paused", 0, "service stopping"); err != nil {
			log.Printf("pause job %d: %v", id, err)
		}
	}
}

func (m *Manager) PauseJobs(ctx context.Context) {
	m.mu.Lock()
	ids := make([]int64, 0, len(m.running))
	for id := range m.running {
		ids = append(ids, id)
	}
	for _, id := range ids {
		m.running[id]()
	}
	m.mu.Unlock()

	for _, id := range ids {
		job, err := models.GetJob(ctx, m.DB, id)
		if err == nil && job.OutputID > 0 {
			outputDir := media.OutputDir(m.DataDir, job.OutputID)
			if ferr := media.FinalizePlaylist(outputDir); ferr != nil {
				log.Printf("finalize playlist job %d: %v", id, ferr)
			}
		}

		if err := models.UpdateJobStatus(ctx, m.DB, id, "paused", 0, "disk space low"); err != nil {
			log.Printf("pause job %d: %v", id, err)
		}
		m.emit(JobEvent{Type: EventPaused, Payload: map[string]any{
			"id":     id,
			"status": "paused",
			"reason": "disk",
		}})
	}
}

func (m *Manager) ResumeAll(ctx context.Context) {
	jobs, err := models.ListJobs(ctx, m.DB, "paused", nil)
	if err != nil {
		log.Printf("list paused jobs: %v", err)
		return
	}

	for _, j := range jobs {
		log.Printf("resuming paused job %d", j.ID)
		if err := m.ResumePausedJob(ctx, j.ID); err != nil {
			log.Printf("resume paused job %d: %v", j.ID, err)
		}
	}
}

func (m *Manager) runJob(ctx context.Context, jobID, sourceID, outputID int64, startNumber int) {
	m.wg.Add(1)
	defer m.wg.Done()

	select {
	case m.sem <- struct{}{}:
	case <-ctx.Done():
		_ = models.UpdateJobStatus(ctx, m.DB, jobID, "stopped", 0, "cancelled before starting")
		return
	}
	defer func() { <-m.sem }()

	ctx, cancel := context.WithCancel(ctx)
	m.mu.Lock()
	m.running[jobID] = cancel
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.running, jobID)
		m.mu.Unlock()
	}()

	if err := models.UpdateJobStatus(ctx, m.DB, jobID, "running", 0, ""); err != nil {
		log.Printf("update job %d running: %v", jobID, err)
		return
	}

	m.emit(JobEvent{Type: EventUpdate, Payload: map[string]any{
		"id": jobID, "status": "running", "progress": 0.0,
	}})

	source, err := models.GetSource(ctx, m.DB, sourceID)
	if err != nil {
		_ = models.FailJob(ctx, m.DB, jobID, fmt.Sprintf("get source: %v", err))
		m.emit(JobEvent{Type: EventError, Payload: map[string]any{
			"id": jobID, "status": "failed", "error": err.Error(),
		}})
		return
	}

	outputDir := media.OutputDir(m.DataDir, outputID)
	if err := media.EnsureOutputDir(outputDir); err != nil {
		_ = models.FailJob(ctx, m.DB, jobID, fmt.Sprintf("create output dir: %v", err))
		return
	}

	var totalDuration float64
	hasVideo := true
	var tcExtra media.TranscodeConfig

	if source.Type == "device" {
		probeCtx, probeCancel := context.WithTimeout(ctx, 10*time.Second)
		info, devInfo, pErr := media.ProbeDevice(probeCtx, source.URL)
		probeCancel()

		if pErr != nil {
			log.Printf("probe device job %d: %v, using defaults", jobID, pErr)
		} else {
			hasVideo = info.HasVideo()
			if devInfo != nil {
				tcExtra.InputFormat = devInfo.InputFormat
				tcExtra.VideoSize = devInfo.VideoSize
				tcExtra.FrameRate = devInfo.FrameRate

				if info.HasVideo() {
					_ = models.UpdateSourceMetadata(ctx, m.DB, sourceID, map[string]any{
						"detected_format": devInfo.InputFormat,
						"detected_size":   devInfo.VideoSize,
						"detected_fps":    devInfo.FrameRate,
					})
				}
			}
		}

		totalDuration = 0
	} else {
		probeCtx, probeCancel := context.WithTimeout(ctx, 60*time.Second)
		info, pErr := media.Probe(probeCtx, source.URL)
		probeCancel()
		if pErr != nil {
			_ = models.FailJob(ctx, m.DB, jobID, fmt.Sprintf("probe: %v", pErr))
			m.emit(JobEvent{Type: EventError, Payload: map[string]any{
				"id": jobID, "status": "failed", "error": pErr.Error(),
			}})
			return
		}

		totalDuration = info.Format.Duration
		hasVideo = info.HasVideo()
		hasAudio := info.HasAudio()

		var newStreamType string
		if hasVideo && hasAudio {
			newStreamType = "audio_video"
		} else if hasVideo {
			newStreamType = "video_only"
		} else if hasAudio {
			newStreamType = "audio_only"
		} else {
			newStreamType = "audio_video"
		}
		if newStreamType != source.StreamType {
			_ = models.UpdateSourceStreamType(ctx, m.DB, sourceID, newStreamType)
		}
	}

	// Start thumbnail generation with retry (runs concurrently with transcode)
	if hasVideo {
		go m.generateThumbnailWithRetry(ctx, source, outputDir, jobID, tcExtra.InputFormat)
	}

	tc := media.TranscodeConfig{
		SourceType:    source.Type,
		SourceURL:     source.URL,
		OutputDir:     outputDir,
		TotalDuration: totalDuration,
		HasVideo:      hasVideo,
		StartNumber:   startNumber,
		InputFormat:   tcExtra.InputFormat,
		VideoSize:     tcExtra.VideoSize,
		FrameRate:     tcExtra.FrameRate,
	}

	var lastProgress atomic.Uint64
	progressTicker := time.NewTicker(2 * time.Second)
	defer progressTicker.Stop()

	go func() {
		for range progressTicker.C {
			m.mu.Lock()
			_, stillRunning := m.running[jobID]
			m.mu.Unlock()
			if !stillRunning {
				return
			}

			p := math.Float64frombits(lastProgress.Load())
			_ = models.UpdateJobStatus(ctx, m.DB, jobID, "running", p, "")
			m.emit(JobEvent{Type: EventUpdate, Payload: map[string]any{
				"id": jobID, "status": "running", "progress": p,
			}})
		}
	}()

	onProgress := func(progress float64, line string) {
		if line != "" && !isProgressLine(line) {
			logEntry := &models.JobLog{
				JobID:   jobID,
				Level:   "info",
				Message: line,
			}
			_ = models.CreateJobLog(ctx, m.DB, logEntry)
			m.emit(JobEvent{Type: EventLog, Payload: map[string]any{
				"id": jobID, "level": "info", "message": line,
			}})
		}

		if progress >= 0 {
			lastProgress.Store(math.Float64bits(progress))
		}
	}

	isLiveSource := source.Type == "rtmp" || source.Type == "rtsp" || source.Type == "device" || source.Type == "hls"
	if isLiveSource {
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := media.RefreshLivePlaylist(outputDir); err != nil {
						log.Printf("refresh live playlist job %d: %v", jobID, err)
					}
				}
			}
		}()
	}

	if err := media.Transcode(ctx, tc, onProgress); err != nil {
		if ctx.Err() != nil {
			p := math.Float64frombits(lastProgress.Load())
			if outputErr := media.FinalizePlaylist(outputDir); outputErr != nil {
				log.Printf("finalize playlist job %d: %v", jobID, outputErr)
			}
			if updateErr := models.UpdateJobStatus(ctx, m.DB, jobID, "paused", p, "interrupted"); updateErr == nil {
				m.emit(JobEvent{Type: EventPaused, Payload: map[string]any{
					"id": jobID, "status": "paused", "reason": "interrupted",
				}})
			}
			return
		}

		_ = models.FailJob(ctx, m.DB, jobID, err.Error())
		m.emit(JobEvent{Type: EventError, Payload: map[string]any{
			"id": jobID, "status": "failed", "error": err.Error(),
		}})
		return
	}

	if err := media.FinalizePlaylist(outputDir); err != nil {
		log.Printf("finalize playlist job %d: %v", jobID, err)
	}

	_ = models.CompleteJob(ctx, m.DB, jobID)
	m.emit(JobEvent{Type: EventComplete, Payload: map[string]any{
		"id": jobID, "status": "completed",
	}})
}

func isProgressLine(line string) bool {
	return len(line) >= 5 && line[:5] == "frame"
}

func (m *Manager) generateThumbnailWithRetry(ctx context.Context, source *models.Source, outputDir string, jobID int64, inputFormat string) {
	thumbPath := media.ThumbnailPath(outputDir)
	isLive := source.Type == "rtmp" || source.Type == "rtsp" || source.Type == "device" || source.Type == "hls"

	for {
		if media.ThumbExists(outputDir) {
			return
		}

		select {
		case <-ctx.Done():
			return
		default:
		}

		// For live streams, try segment-based first
		if isLive {
			segments, _ := media.ListSegments(outputDir)
			if len(segments) > 0 {
				segmentPath := media.SegmentPath(outputDir, segments[0])
				thumbCtx, thumbCancel := context.WithTimeout(ctx, 30*time.Second)
				if err := media.GenerateThumbnailFromSegment(thumbCtx, segmentPath, thumbPath); err != nil {
					log.Printf("thumbnail retry job %d from segment: %v", jobID, err)
				} else {
					thumbCancel()
					return
				}
				thumbCancel()
			}
		}

		// Fallback: try source directly
		thumbCtx, thumbCancel := context.WithTimeout(ctx, 30*time.Second)
		if err := media.GenerateThumbnail(thumbCtx, source.URL, inputFormat, thumbPath); err != nil {
			log.Printf("thumbnail retry job %d from source: %v", jobID, err)
		} else {
			thumbCancel()
			return
		}
		thumbCancel()

		// Wait before retry
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}
