package job

import (
	"context"
	"log"
	"time"

	"github.com/arthur/vieo/internal/disk"
)

type DiskWatcher struct {
	DataDir string
	Warn    int
	Crit    int
	Manager *Manager
	paused  bool
}

func NewDiskWatcher(dataDir string, warn, crit int, mgr *Manager) *DiskWatcher {
	return &DiskWatcher{
		DataDir: dataDir,
		Warn:    warn,
		Crit:    crit,
		Manager: mgr,
	}
}

func (w *DiskWatcher) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.check(ctx)
		}
	}
}

func (w *DiskWatcher) check(ctx context.Context) {
	usage, _, _, err := disk.Usage(w.DataDir)
	if err != nil {
		log.Printf("disk watcher: %v", err)
		return
	}

	log.Printf("disk usage: %.1f%% (warn=%d%%, crit=%d%%)", usage, w.Warn, w.Crit)

	if usage >= float64(w.Crit) {
		log.Printf("CRITICAL disk usage: %.1f%% — stopping all jobs", usage)
		w.Manager.PauseJobs(ctx)
		w.paused = true
		return
	}

	if usage >= float64(w.Warn) {
		if !w.paused {
			log.Printf("disk usage at %.1f%% — pausing jobs", usage)
			w.Manager.PauseJobs(ctx)
			w.paused = true
		}
		return
	}

	if w.paused {
		log.Printf("disk usage recovered to %.1f%% — resuming jobs", usage)
		w.Manager.ResumeAll(ctx)
		w.paused = false
	}
}
