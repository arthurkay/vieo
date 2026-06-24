package server

import (
	"time"

	"github.com/arthur/vieo/internal/server/handler"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

func (s *Server) setupRoutes() {
	s.Router.Get("/api/health", handler.Health(s.DB, s.Config.DataDir, s.Config.DiskWarn, s.Config.DiskCrit))

	s.Router.Route("/api/channels", func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))
		r.Get("/", handler.ListChannels(s.DB))
		r.Post("/", handler.CreateChannel(s.DB))
		r.Get("/{id}", handler.GetChannel(s.DB))
		r.Put("/{id}", handler.UpdateChannel(s.DB))
		r.Delete("/{id}", handler.DeleteChannel(s.DB))
	})

	s.Router.Route("/api/sources", func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))
		r.Get("/", handler.ListSources(s.DB))
		r.Post("/", handler.CreateSource(s.DB))
		r.Get("/{id}", handler.GetSource(s.DB))
		r.Delete("/{id}", handler.DeleteSource(s.DB))
	})

	s.Router.Route("/api/outputs", func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))
		r.Get("/", handler.ListOutputs(s.DB))
		r.Post("/", handler.CreateOutput(s.DB))
		r.Delete("/{id}", handler.DeleteOutput(s.DB))
	})

	s.Router.Route("/api/jobs", func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))
		r.Get("/", handler.ListJobs(s.DB))
		r.Post("/", handler.CreateJob(s.DB, s.Manager))
		r.Post("/{id}/stop", handler.StopJob(s.DB, s.Manager))
		r.Post("/{id}/pause", handler.PauseJob(s.DB, s.Manager))
		r.Post("/{id}/resume", handler.ResumeJob(s.DB, s.Manager))
		r.Post("/{id}/retry", handler.RetryJob(s.DB, s.Manager))
		r.Delete("/{id}", handler.DeleteJob(s.DB))
	})

	s.Router.Get("/api/stream/{id}/*", handler.StreamHLS(s.Config.DataDir))

	s.Router.Get("/api/ws", handler.WebSocket(s.DB, s.Manager))

	s.Router.HandleFunc("/*", s.serveFrontend)
}
