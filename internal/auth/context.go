package auth

import (
	"context"

	"github.com/arthur/vieo/internal/db/models"
)

type contextKey string

const userContextKey contextKey = "user"

func UserFromContext(ctx context.Context) *models.User {
	user, _ := ctx.Value(userContextKey).(*models.User)
	return user
}

func ContextWithUser(ctx context.Context, user *models.User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}
