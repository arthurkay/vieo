package server

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/arthur/vieo/internal/config"
	"github.com/arthur/vieo/internal/job"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	Config  *config.Config
	DB      *sql.DB
	Manager *job.Manager
	Router  *chi.Mux
	http    *http.Server
}

func New(cfg *config.Config, db *sql.DB, mgr *job.Manager) *Server {
	s := &Server{
		Config:  cfg,
		DB:      db,
		Manager: mgr,
	}

	s.Router = chi.NewRouter()
	s.setupMiddleware()
	s.setupRoutes()

	return s
}

func (s *Server) setupMiddleware() {
	s.Router.Use(chimw.Logger)
	s.Router.Use(chimw.Recoverer)
	s.Router.Use(chimw.RealIP)
	s.Router.Use(corsMiddleware)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start(ctx context.Context) error {
	s.http = &http.Server{
		Addr:    s.Config.HTTPAddr,
		Handler: s.Router,
	}

	log.Printf("HTTP server listening on %s", s.Config.HTTPAddr)

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		s.http.Shutdown(shutdownCtx)
	}()

	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}

	return nil
}

func (s *Server) serveFrontend(w http.ResponseWriter, r *http.Request) {
	dirs := []string{"./web/dist", "../web/dist"}
	frontendDir := ""
	for _, d := range dirs {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			frontendDir = d
			break
		}
	}

	if frontendDir == "" {
		http.Error(w, "frontend not built", http.StatusNotFound)
		return
	}

	path := r.URL.Path
	if path == "/" || path == "" {
		path = "/index.html"
	}

	fullPath := filepath.Join(frontendDir, path)

	// Prevent path traversal
	absFrontend, _ := filepath.Abs(frontendDir)
	absFull, _ := filepath.Abs(fullPath)
	if len(absFull) < len(absFrontend) || absFull[:len(absFrontend)] != absFrontend {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		http.ServeFile(w, r, filepath.Join(frontendDir, "index.html"))
		return
	}

	http.ServeFile(w, r, fullPath)
}
