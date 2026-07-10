package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/arthur/vieo/internal/auth"
	"github.com/arthur/vieo/internal/db/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/go-chi/chi/v5"
)

func Login(db *sql.DB, jwtSecret string) http.HandlerFunc {
	type loginRequest struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if req.Username == "" || req.Password == "" {
			http.Error(w, "username and password required", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserByUsername(r.Context(), db, req.Username)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if user == nil || !models.CheckPassword(user, req.Password) {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"user_id":  user.ID,
			"username": user.Username,
			"role":     user.Role,
			"exp":      time.Now().Add(7 * 24 * time.Hour).Unix(),
		})
		tokenStr, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			http.Error(w, "generate token", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "vieo_session",
			Value:    tokenStr,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   7 * 24 * 60 * 60,
		})

		writeJSON(w, user)
	}
}

func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     "vieo_session",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
		})
		w.WriteHeader(http.StatusNoContent)
	}
}

func Me(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		writeJSON(w, user)
	}
}

func ListUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := models.ListUsers(r.Context(), db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, users)
	}
}

func CreateUser(db *sql.DB) http.HandlerFunc {
	type createRequest struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req createRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		if req.Username == "" || req.Password == "" {
			http.Error(w, "username and password required", http.StatusBadRequest)
			return
		}
		if req.Role == "" {
			req.Role = "guest"
		}
		if req.Role != "admin" && req.Role != "guest" {
			http.Error(w, "role must be admin or guest", http.StatusBadRequest)
			return
		}

		user, err := models.CreateUser(r.Context(), db, req.Username, req.Password, req.Role)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, user)
	}
}

func DeleteUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}

		if err := models.DeleteUser(r.Context(), db, id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
