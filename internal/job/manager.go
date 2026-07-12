package job

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/media"
)

type EventType string

const (
	EventUpdate         EventType = "job:update"
	EventLog            EventType = "job:log"
	EventComplete       EventType = "job:complete"
	EventError          EventType = "job:error"
	EventPaused         EventType = "job:paused"
	EventExportProgress EventType = "export:progress"
	EventExportComplete EventType = "export:complete"
	EventExportError    EventType = "export:error"
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

	mu           sync.Mutex
	running      map[int64]context.CancelFunc
	exportRunning map[int64]context.CancelFunc
	sem          chan struct{}
	events       chan JobEvent
	wg           sync.WaitGroup
}

func NewManager(db *sql.DB, dataDir string, maxJobs, diskWarn, diskCrit int) *Manager {
	return &Manager{
		DB:            db,
		DataDir:       dataDir,
		MaxJobs:       maxJobs,
		DiskWarn:      diskWarn,
		DiskCrit:      diskCrit,
		running:       make(map[int64]context.CancelFunc),
		exportRunning: make(map[int64]context.CancelFunc),
		sem:           make(chan struct{}, maxJobs),
		events:        make(chan JobEvent, 100),
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
		go func() {
			if err := media.FinalizePlaylist(context.Background(), outputDir); err != nil {
				log.Printf("finalize playlist job %d: %v", jobID, err)
			}
			m.generateFilmstrip(job.OutputID, job.CreatedAt)
		}()
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
		go func() {
			if err := media.FinalizePlaylist(context.Background(), outputDir); err != nil {
				log.Printf("finalize playlist job %d: %v", jobID, err)
			}
			m.generateFilmstrip(job.OutputID, job.CreatedAt)
		}()
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
			go func(dir string, jid int64) {
				if ferr := media.FinalizePlaylist(context.Background(), dir); ferr != nil {
					log.Printf("finalize playlist job %d: %v", jid, ferr)
				}
			}(outputDir, id)
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
			go func(dir string, jid int64) {
				if ferr := media.FinalizePlaylist(context.Background(), dir); ferr != nil {
					log.Printf("finalize playlist job %d: %v", jid, ferr)
				}
			}(outputDir, id)
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

	switch source.Type {
	case "device":
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
	case "udp", "rtp", "srt":
		probeCtx, probeCancel := context.WithTimeout(ctx, 15*time.Second)
		info, pErr := media.ProbeNetworkStream(probeCtx, source.URL, source.Type)
		probeCancel()

		if pErr != nil {
			log.Printf("probe network stream job %d: %v, continuing without probe data", jobID, pErr)
		} else {
			totalDuration = 0
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

			resolution := ""
			videoCodec := ""
			audioCodec := ""
			for _, s := range info.Streams {
				if s.CodecType == "video" && resolution == "" {
					resolution = fmt.Sprintf("%dx%d", s.Width, s.Height)
					videoCodec = s.CodecName
				}
				if s.CodecType == "audio" && audioCodec == "" {
					audioCodec = s.CodecName
				}
			}
			_ = models.UpdateSourceMetadata(ctx, m.DB, sourceID, map[string]any{
				"last_recorded": time.Now().Format(time.RFC3339),
				"source_type":   source.Type,
				"resolution":    resolution,
				"video_codec":   videoCodec,
				"audio_codec":   audioCodec,
			})
		}
	default:
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

		resolution := ""
		videoCodec := ""
		audioCodec := ""
		for _, s := range info.Streams {
			if s.CodecType == "video" && resolution == "" {
				resolution = fmt.Sprintf("%dx%d", s.Width, s.Height)
				videoCodec = s.CodecName
			}
			if s.CodecType == "audio" && audioCodec == "" {
				audioCodec = s.CodecName
			}
		}
		_ = models.UpdateSourceMetadata(ctx, m.DB, sourceID, map[string]any{
			"last_recorded": time.Now().Format(time.RFC3339),
			"total_duration": totalDuration,
			"resolution":    resolution,
			"video_codec":   videoCodec,
			"audio_codec":   audioCodec,
		})
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

	isLiveSource := source.Type == "rtmp" || source.Type == "rtsp" || source.Type == "device" || source.Type == "hls" || source.Type == "udp" || source.Type == "rtp" || source.Type == "srt"
	if isLiveSource {
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := media.RefreshLivePlaylist(ctx, outputDir); err != nil {
						log.Printf("refresh live playlist job %d: %v", jobID, err)
					}
				}
			}
		}()
	}

	if err := media.Transcode(ctx, tc, onProgress); err != nil {
		if ctx.Err() != nil {
			return
		}

		_ = models.FailJob(ctx, m.DB, jobID, err.Error())
		m.emit(JobEvent{Type: EventError, Payload: map[string]any{
			"id": jobID, "status": "failed", "error": err.Error(),
		}})
		return
	}

	if err := media.FinalizePlaylist(ctx, outputDir); err != nil {
		log.Printf("finalize playlist job %d: %v", jobID, err)
	}

	completedJob, jobErr := models.GetJob(ctx, m.DB, jobID)
	if jobErr == nil {
		go m.generateFilmstrip(outputID, completedJob.CreatedAt)
	}

	_ = models.CompleteJob(ctx, m.DB, jobID)
	m.emit(JobEvent{Type: EventComplete, Payload: map[string]any{
		"id": jobID, "status": "completed",
	}})
}

func (m *Manager) StartExport(ctx context.Context, sourceID, outputID int64, startTime, duration float64) (*models.Export, error) {
	export, err := models.CreateExport(ctx, m.DB, sourceID, outputID, startTime, duration)
	if err != nil {
		return nil, fmt.Errorf("create export: %w", err)
	}

	playlistPath := media.OutputDir(m.DataDir, outputID) + "/playlist.m3u8"
	outputDir := filepath.Join(m.DataDir, "exports")
	if err := media.EnsureOutputDir(outputDir); err != nil {
		_ = models.FailExport(ctx, m.DB, export.ID, fmt.Sprintf("create export dir: %v", err))
		return nil, err
	}
	outputPath := filepath.Join(outputDir, fmt.Sprintf("clip_%d.mp4", export.ID))

	source, err := models.GetSource(ctx, m.DB, sourceID)
	if err != nil {
		_ = models.FailExport(ctx, m.DB, export.ID, fmt.Sprintf("get source: %v", err))
		return nil, err
	}

	exportCtx, cancel := context.WithCancel(context.Background())
	m.mu.Lock()
	m.exportRunning[export.ID] = cancel
	m.mu.Unlock()

	go func() {
		defer func() {
			m.mu.Lock()
			delete(m.exportRunning, export.ID)
			m.mu.Unlock()
		}()

		_ = models.UpdateExportStatus(exportCtx, m.DB, export.ID, "processing", 0)
		m.emit(JobEvent{Type: EventExportProgress, Payload: map[string]any{
			"id": export.ID, "status": "processing", "progress": 0.0,
		}})

		var lastProgress atomic.Uint64
		progressTicker := time.NewTicker(2 * time.Second)
		defer progressTicker.Stop()

		go func() {
			for range progressTicker.C {
				p := math.Float64frombits(lastProgress.Load())
				m.emit(JobEvent{Type: EventExportProgress, Payload: map[string]any{
					"id": export.ID, "status": "processing", "progress": p,
				}})
				_ = models.UpdateExportStatus(exportCtx, m.DB, export.ID, "processing", p)
			}
		}()

		onProgress := func(progress float64, line string) {
			if progress >= 0 {
				lastProgress.Store(math.Float64bits(progress))
			}
		}

		cfg := media.ExportConfig{
			PlaylistPath: playlistPath,
			StartTime:    startTime,
			Duration:     duration,
			OutputPath:   outputPath,
			HasVideo:     source.StreamType != "audio_only",
		}

		if err := media.ExportClip(exportCtx, cfg, onProgress); err != nil {
			if exportCtx.Err() != nil {
				_ = models.FailExport(context.Background(), m.DB, export.ID, "cancelled")
			} else {
				_ = models.FailExport(context.Background(), m.DB, export.ID, err.Error())
			}
			m.emit(JobEvent{Type: EventExportError, Payload: map[string]any{
				"id": export.ID, "status": "failed", "error": err.Error(),
			}})
			return
		}

		var fileSize int64
		if info, err := os.Stat(outputPath); err == nil {
			fileSize = info.Size()
		}

		if err := models.CompleteExport(context.Background(), m.DB, export.ID, outputPath, fileSize); err != nil {
			log.Printf("complete export %d: %v", export.ID, err)
		}
		m.emit(JobEvent{Type: EventExportComplete, Payload: map[string]any{
			"id": export.ID, "status": "completed", "file_size": fileSize,
		}})
	}()

	return export, nil
}

func (m *Manager) CancelExport(ctx context.Context, exportID int64) error {
	m.mu.Lock()
	cancel, ok := m.exportRunning[exportID]
	m.mu.Unlock()

	if ok {
		cancel()
	}

	return models.FailExport(ctx, m.DB, exportID, "cancelled")
}

func isProgressLine(line string) bool {
	return len(line) >= 5 && line[:5] == "frame"
}

func (m *Manager) generateThumbnailWithRetry(ctx context.Context, source *models.Source, outputDir string, jobID int64, inputFormat string) {
	thumbPath := media.ThumbnailPath(outputDir)
	isLive := source.Type == "rtmp" || source.Type == "rtsp" || source.Type == "device" || source.Type == "hls" || source.Type == "udp" || source.Type == "rtp" || source.Type == "srt"

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

func (m *Manager) generateFilmstrip(outputID int64, createdAt string) {
	outputDir := media.OutputDir(m.DataDir, outputID)

	// Parse the job's created_at time
	createdAtTime := time.Now()
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		createdAtTime = t
	} else if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		createdAtTime = t
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	if err := media.GenerateFilmstrip(ctx, outputDir, createdAtTime, 0); err != nil {
		log.Printf("generate filmstrip output %d: %v", outputID, err)
		return
	}
	_ = models.MarkFilmstripGenerated(ctx, m.DB, outputID)
	log.Printf("filmstrip generated for output %d", outputID)
}
