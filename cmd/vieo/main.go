package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/arthur/vieo/internal/config"
	"github.com/arthur/vieo/internal/db"
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

	if err := media.EnsureOutputDir(cfg.DataDir); err != nil {
		log.Fatalf("data dir: %v", err)
	}

	mgr := job.NewManager(database.DB, cfg.DataDir, cfg.MaxJobs, cfg.DiskWarn, cfg.DiskCrit)

	handler.StartBroadcastLoop(ctx, mgr)

	if err := mgr.ResumeJobs(ctx); err != nil {
		log.Printf("resume jobs: %v", err)
	}

	watcher := job.NewDiskWatcher(cfg.DataDir, cfg.DiskWarn, cfg.DiskCrit, mgr)
	go watcher.Start(ctx)

	srv := server.New(cfg, database.DB, mgr)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("shutting down...")
		mgr.StopAll(ctx)
		cancel()
	}()

	log.Fatal(srv.Start(ctx))
}
