# Go API service

Handles the store's public API: pricing, checkout, discounts and payment webhooks.
Next.js keeps the pages and admin; both share the same Postgres.

## Run

```bash
cd server
DATABASE_URL="postgresql://drop:drop@localhost:5433/drop_store" \
GO_API_PORT=8081 \
SITE_URL=http://localhost:3002 \
go run ./cmd/api
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| POST | `/v1/quote` | Price a cart (tax, shipping, discount, FX) |
| POST | `/v1/discount` | Validate a code against a subtotal |
| POST | `/v1/checkout` | Create the order and start payment |
| POST | `/v1/webhooks/stripe` | Stripe callbacks |
| POST | `/v1/webhooks/paypal` | PayPal callbacks |

`/v1/quote` is byte-for-byte compatible with the TypeScript implementation —
verified across 10 country/currency combinations during migration.

## Layout

```
cmd/api          entry point, graceful shutdown
internal/api     routing, handlers, middleware, rendering
internal/store   cart pricing and quote assembly
internal/tax     rate resolution (region > country > *), tax extraction
internal/shipping method eligibility and free-shipping thresholds
internal/discount every validity rule in one place
internal/gateway Provider interface; Stripe and PayPal implementations
internal/money   integer minor units, FX conversion, currency formatting
internal/db      pgx pool
```

## Money

Everything is `money.Amount` (int64 minor units of the base currency). The type
makes "is this dollars or cents?" a compile error rather than a bug. FX
conversion happens once, at render.

## Coexisting with the TypeScript backend

Set `GO_API_URL` in the Next.js `.env` and `/api/quote`, `/api/discount` and
`/api/checkout` forward to Go, falling back to the TS implementation if the
service is unreachable. Unset it and nothing changes.

## Tests

```bash
go test ./...      # money formatting, tax math, webhook mapping
go vet ./...
```

## Docker

```bash
docker compose up -d api      # from the repo root
```
