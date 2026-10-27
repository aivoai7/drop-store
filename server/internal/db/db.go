package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgx so callers get a tiny surface: query, exec, transaction.
type Pool struct {
	*pgxpool.Pool
}

func sanitizeURL(raw string) string {
	raw = strings.ReplaceAll(raw, "?schema=public", "")
	raw = strings.ReplaceAll(raw, "&schema=public", "")
	return raw
}

func Open(ctx context.Context, databaseURL string) (*Pool, error) {
	// Prisma connection strings carry ?schema=public, which is not a libpq
	// parameter. Strip it before handing the URL to pgx.
	cfg, err := pgxpool.ParseConfig(sanitizeURL(databaseURL))
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Pool{Pool: pool}, nil
}
