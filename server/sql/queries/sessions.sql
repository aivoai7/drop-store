-- name: GetSessionUser :one
SELECT u.id, u.email, u.name, u.disabled
FROM "Session" s
JOIN "User" u ON u.id = s."userId"
WHERE s.token = $1 AND s."expiresAt" > now();

-- name: CountRateEvents :one
SELECT COUNT(*) FROM "RateLimitEvent"
WHERE bucket = $1 AND "createdAt" > $2;

-- name: InsertRateEvent :exec
INSERT INTO "RateLimitEvent" (id, bucket, "createdAt") VALUES ($1, $2, now());

-- name: OldestRateEvent :one
SELECT "createdAt" FROM "RateLimitEvent"
WHERE bucket = $1 AND "createdAt" > $2
ORDER BY "createdAt" ASC
LIMIT 1;
