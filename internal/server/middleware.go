package server

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/arthur/vieo/internal/auth"
	"github.com/arthur/vieo/internal/db/models"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware(db *sql.DB, jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr, err := r.Cookie("vieo_session")
			if err != nil || tokenStr.Value == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			token, err := jwt.Parse(tokenStr.Value, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, "invalid claims", http.StatusUnauthorized)
				return
			}

			userIDf, ok := claims["user_id"].(float64)
			if !ok {
				http.Error(w, "invalid user id", http.StatusUnauthorized)
				return
			}
			userID := int64(userIDf)

			user, err := models.GetUserByID(r.Context(), db, userID)
			if err != nil || user == nil {
				http.Error(w, "user not found", http.StatusUnauthorized)
				return
			}

			ctx := auth.ContextWithUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := auth.UserFromContext(r.Context())
			if user == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			allowed := false
			for _, role := range roles {
				if user.Role == role {
					allowed = true
					break
				}
			}
			if !allowed {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func OptionalAuth(db *sql.DB, jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr, err := r.Cookie("vieo_session")
			if err != nil || tokenStr.Value == "" {
				next.ServeHTTP(w, r)
				return
			}

			token, err := jwt.Parse(tokenStr.Value, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				next.ServeHTTP(w, r)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			userIDf, ok := claims["user_id"].(float64)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			userID := int64(userIDf)

			user, err := models.GetUserByID(r.Context(), db, userID)
			if err != nil || user == nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := auth.ContextWithUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func ParseBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
