package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/arthur/vieo/internal/config"
	"github.com/arthur/vieo/internal/db"
	"github.com/arthur/vieo/internal/db/models"
	"github.com/arthur/vieo/internal/job"
	"github.com/arthur/vieo/internal/media"
	"github.com/arthur/vieo/internal/server"
	"github.com/arthur/vieo/internal/server/handler"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.Open(ctx, cfg.DBPath)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	if cfg.AuthEnabled {
		seedAdminUser(ctx, database.DB)
	}

	if err := media.EnsureOutputDir(cfg.DataDir); err != nil {
		log.Fatalf("data dir: %v", err)
	}

	mgr := job.NewManager(database.DB, cfg.DataDir, cfg.MaxJobs, cfg.DiskWarn, cfg.DiskCrit)

	handler.StartBroadcastLoop(ctx, mgr)

	if err := mgr.ResumeJobs(ctx); err != nil {
		log.Printf("resume jobs: %v", err)
	}

	go generateMissingFilmstrips(ctx, database.DB, cfg.DataDir)

	watcher := job.NewDiskWatcher(cfg.DataDir, cfg.DiskWarn, cfg.DiskCrit, mgr)
	go watcher.Start(ctx)

	scheduler := job.NewScheduler(database.DB, cfg.DataDir, mgr)
	go scheduler.Start(ctx)

	srv := server.New(cfg, database.DB, mgr)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("shutting down...")
		mgr.StopAll(ctx)
		cancel()
		mgr.Wait()
	}()

	log.Fatal(srv.Start(ctx))
}

func seedAdminUser(ctx context.Context, database *sql.DB) {
	count, err := models.UserCount(ctx, database)
	if err != nil {
		log.Printf("check user count: %v", err)
		return
	}
	if count > 0 {
		return
	}

	_, err = models.CreateUser(ctx, database, "admin", "admin", "admin")
	if err != nil {
		log.Printf("create admin user: %v", err)
		return
	}
	log.Printf("created default admin user (username: admin, password: admin)")
}

func generateMissingFilmstrips(ctx context.Context, database *sql.DB, dataDir string) {
	outputs, err := models.ListOutputsWithoutFilmstrip(ctx, database)
	if err != nil {
		log.Printf("list outputs without filmstrip: %v", err)
		return
	}
	if len(outputs) == 0 {
		return
	}

	log.Printf("generating filmstrips for %d existing outputs...", len(outputs))
	for _, o := range outputs {
		select {
		case <-ctx.Done():
			return
		default:
		}

		outputDir := media.OutputDir(dataDir, o.ID)
		createdAtTime, _ := parseCreatedAt(o.CreatedAt)

		filmstripCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
		if err := media.GenerateFilmstrip(filmstripCtx, outputDir, createdAtTime, 0); err != nil {
			log.Printf("retroactive filmstrip output %d: %v", o.ID, err)
			cancel()
			continue
		}
		cancel()

		_ = models.MarkFilmstripGenerated(ctx, database, o.ID)
		log.Printf("retroactive filmstrip generated for output %d", o.ID)
	}
	log.Printf("retroactive filmstrip generation complete")
}

func parseCreatedAt(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}
