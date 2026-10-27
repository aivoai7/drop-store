package ratelimit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"math"
	"time"

	"github.com/aivoai7/drop-store/server/internal/db"
)

type Result struct {
	OK                bool
	Remaining         int
	RetryAfterSeconds int
}

// Limit is a sliding-window limiter backed by Postgres rows, matching the
// TypeScript implementation so both backends enforce the same numbers.
//
// Every allowed attempt inserts a row; anything older than the window is
// ignored, which makes this a true sliding window rather than a fixed bucket.
func Limit(ctx context.Context, pool *db.Pool, bucket string, limit int, window time.Duration) (Result, error) {
	windowStart := time.Now().Add(-window)

	var hits int64
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM "RateLimitEvent" WHERE bucket = $1 AND "createdAt" >= $2`,
		bucket, windowStart,
	).Scan(&hits)
	if err != nil {
		return Result{OK: true, Remaining: limit}, err
	}

	if int(hits) >= limit {
		var oldest time.Time
		err := pool.QueryRow(ctx,
			`SELECT "createdAt" FROM "RateLimitEvent"
			 WHERE bucket = $1 AND "createdAt" >= $2
			 ORDER BY "createdAt" ASC LIMIT 1`,
			bucket, windowStart,
		).Scan(&oldest)

		retry := 1
		if err == nil {
			remaining := oldest.Add(window).Sub(time.Now())
			retry = int(math.Ceil(remaining.Seconds()))
			if retry < 1 {
				retry = 1
			}
		}
		return Result{OK: false, Remaining: 0, RetryAfterSeconds: retry}, nil
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO "RateLimitEvent" (id, bucket, "createdAt") VALUES ($1, $2, now())`,
		newID(), bucket,
	); err != nil {
		// Never fail a checkout because the limiter table is unavailable.
		return Result{OK: true, Remaining: limit}, nil
	}

	return Result{OK: true, Remaining: limit - int(hits) - 1}, nil
}

// FormatRetry renders a retry window the way the API responses expect.
func FormatRetry(seconds int) string {
	if seconds < 60 {
		return itoa(seconds) + "s"
	}
	return itoa(int(math.Ceil(float64(seconds)/60))) + " min"
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
