package server

import (
	"time"

	"github.com/arthur/vieo/internal/server/handler"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

func (s *Server) setupRoutes() {
	s.Router.Get("/api/health", handler.Health(s.DB, s.Config.DataDir, s.Config.DiskWarn, s.Config.DiskCrit, s.Config.Watermark))

	// Auth routes (public)
	s.Router.Post("/api/auth/login", handler.Login(s.DB, s.Config.JWTSecret))
	s.Router.Post("/api/auth/logout", handler.Logout())

	// Protected auth routes
	s.Router.Group(func(r chi.Router) {
		r.Use(AuthMiddleware(s.DB, s.Config.JWTSecret))
		r.Get("/api/auth/me", handler.Me(s.DB))
		r.Route("/api/auth/users", func(r chi.Router) {
			r.Use(RequireRole("admin"))
			r.Get("/", handler.ListUsers(s.DB))
			r.Post("/", handler.CreateUser(s.DB))
			r.Delete("/{id}", handler.DeleteUser(s.DB))
		})
	})

	// Admin-only routes
	s.Router.Group(func(r chi.Router) {
		r.Use(AuthMiddleware(s.DB, s.Config.JWTSecret))
		r.Use(RequireRole("admin"))

		r.Route("/api/sources", func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))
			r.Get("/", handler.ListSources(s.DB))
			r.Post("/", handler.CreateSource(s.DB))
			r.Get("/{id}", handler.GetSource(s.DB))
			r.Put("/{id}", handler.UpdateSource(s.DB))
			r.Delete("/{id}", handler.DeleteSource(s.DB))
		})

		r.Route("/api/outputs", func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))
			r.Get("/", handler.ListOutputs(s.DB))
			r.Post("/", handler.CreateOutput(s.DB))
			r.Get("/{id}/storage", handler.GetOutputStorage(s.DB, s.Config.DataDir))
			r.Delete("/{id}", handler.DeleteOutput(s.DB))
		})

		r.Route("/api/jobs", func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))
			r.Get("/", handler.ListJobs(s.DB))
			r.Post("/", handler.CreateJob(s.DB, s.Manager))
			r.Post("/{id}/stop", handler.StopJob(s.DB, s.Manager))
			r.Post("/{id}/pause", handler.PauseJob(s.DB, s.Manager))
			r.Post("/{id}/resume", handler.ResumeJob(s.DB, s.Manager))
			r.Post("/{id}/continue", handler.ContinueJob(s.DB, s.Manager))
			r.Get("/{id}/logs", handler.ListJobLogs(s.DB))
			r.Delete("/{id}", handler.DeleteJob(s.DB, s.Manager))
		})

		r.Route("/api/schedules", func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))
			r.Get("/", handler.ListSchedules(s.DB))
			r.Post("/", handler.CreateSchedule(s.DB))
			r.Get("/{id}", handler.GetSchedule(s.DB))
			r.Put("/{id}", handler.UpdateSchedule(s.DB))
			r.Delete("/{id}", handler.DeleteSchedule(s.DB))
		})
	})

	// Channels: optional auth (guests see public, admins see all)
	s.Router.Route("/api/channels", func(r chi.Router) {
		r.Use(chimw.Timeout(60 * time.Second))
		r.Use(OptionalAuth(s.DB, s.Config.JWTSecret))
		r.Get("/", handler.ListChannels(s.DB, s.Config.JWTSecret))
		r.Get("/{id}", handler.GetChannel(s.DB))
		// Mutations require admin
		r.Group(func(r chi.Router) {
			r.Use(AuthMiddleware(s.DB, s.Config.JWTSecret))
			r.Use(RequireRole("admin"))
			r.Post("/", handler.CreateChannel(s.DB))
			r.Put("/{id}", handler.UpdateChannel(s.DB))
			r.Delete("/{id}", handler.DeleteChannel(s.DB))
		})
	})

	// Public routes
	s.Router.Get("/api/stream/{id}/*", handler.StreamHLS(s.Config.DataDir))
	s.Router.Get("/api/ws", handler.WebSocket(s.DB, s.Manager))
	s.Router.HandleFunc("/*", s.serveFrontend)
}
