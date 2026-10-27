package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
)

type sessionUser struct {
	ID    string
	Email string
	Name  string
}

// sessionUser resolves the customer session cookie the TypeScript bridge
// forwards. Tokens are stored SHA-256 hashed, matching src/lib/auth.ts, so the
// same lookup works whichever backend validates it.
func (s *Server) sessionUser(ctx context.Context, r *http.Request) *sessionUser {
	token, err := r.Cookie(s.cfg.SessionCookie)
	if err != nil || token.Value == "" {
		return nil
	}
	sum := sha256.Sum256([]byte(token.Value))

	var u sessionUser
	err = s.pool.QueryRow(ctx,
		`SELECT u.id, u.email, u.name FROM "Session" se
		 JOIN "User" u ON u.id = se."userId"
		 WHERE se.token = $1 AND se."expiresAt" > now() AND NOT u.disabled`,
		hex.EncodeToString(sum[:]),
	).Scan(&u.ID, &u.Email, &u.Name)
	if err != nil {
		return nil
	}
	return &u
}
