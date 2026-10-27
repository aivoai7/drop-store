# DROP — Sneaker & Bag Store

A production-shaped DTC storefront: dark streetwear aesthetic, English/USD, full checkout and an admin back office.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4
- Prisma 6 + PostgreSQL 16 (runs in Docker, see below)
- Zustand (cart, persisted to localStorage)
- Zod (checkout payload validation)

## Run it

```bash
docker compose up -d # Postgres 16 on localhost:5433 (container `drop-db`)
npm install          # also runs prisma generate
npm run db:push      # create the schema
npm run db:seed      # 19 demo products, 3 categories
npm run dev          # http://localhost:3000 (auto-shifts to 3002 if 3000 is taken)
```

`npm run db:reset` wipes and reseeds.

The database lives in the `drop-db-data` Docker volume, so it survives container restarts. **Port 5433** is deliberate — 5432 is already taken by another container on this machine.

Connection string in `.env`:

```
DATABASE_URL="postgresql://drop:<password>@localhost:5433/drop_store?schema=public"
```

Credentials are dev-only (`drop`/`drop`, set in `docker-compose.yml`). For a real deployment, use a managed Postgres (Neon/Supabase/RDS), set the URL via the host's env vars, and never commit `.env`. To reset the volume entirely: `docker compose down -v`.

## Storefront

| Route | What it does |
| --- | --- |
| `/` | Hero, featured products, category tiles |
| `/shop` | Category filter, search (`?q=`), price sort |
| `/product/[slug]` | Gallery, color/size picker, add to bag / buy now |
| `/cart` | Quantity edit, free-shipping threshold ($150) |
| `/checkout` | Demo checkout form → creates a real `Order` row |
| `/signup`, `/login` | Customer accounts — scrypt-hashed passwords, DB-backed sessions |
| `/forgot-password`, `/reset-password` | Single-use, 30-minute reset links |
| `/account` | Signed-in order history (redirects guests to `/login?next=…`) |

Cart lives in `localStorage`; order totals and item prices are **recalculated server-side** in `/api/checkout` from the database, so a tampered cart can't change what's charged.

## Admin

`/admin` uses **real per-user accounts with roles**, not a shared password.

### Payments (admin)

`/admin/payments` is the money view: what was collected, what was refunded, and what is still owed.

- **Partial refunds** — enter any amount up to the remaining balance, with a reason. Repeat until fully refunded.
- **Automatic settlement** — a refund goes through Stripe when the order has a payment intent; otherwise it settles locally (demo, bank transfer, cash) and is recorded in the ledger.
- **Manual capture** — "Mark as paid" records an offline payment for orders that never went through a card processor.
- **Re-check Stripe** — re-reads the Checkout Session for orders whose webhook never arrived.
- **`PaymentEvent` ledger** — every charge, manual capture, sync and refund with amount, provider, reference and actor.

Refunds email the customer and land in the audit log. `paymentStatus` is one of `pending | paid | partially_refunded | refunded | failed`.

### Order lifecycle

`pending → paid → shipped`, with `cancelled` available at any point.

- Paying reserves variant stock (demo checkout and the Stripe webhook both call it)
- Cancelling restores stock exactly once, guarded by `Order.stockRestored`
- Shipping records carrier + tracking and sends a shipping email

The seed creates `admin@drop.test` / `<change-me>` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). If the `AdminUser` table is empty, `/admin/login` shows a one-time "Create admin" form instead, so you never have to ship a default credential.

| Section | What it does |
| --- | --- |
| Dashboard | Revenue, paid orders, AOV, customers, low-stock list, recent activity |
| Orders | Status filters, search, refunds, detail page with address/note editing |
| Order detail | Shipping (carrier + tracking, emails the customer), timeline, stock restore on cancel |
| Products | Create/edit/delete, drafts, category, tags, images, bulk actions, price adjustments |
| Product variants | Per color/size SKU, stock, optional price override — stock is the variant sum |
| Categories | Create, rename, hide, delete (blocked while products reference it) |
| Customers | Search, lifetime spend, order history, password reset, disable account |
| Discounts | Percentage/fixed codes, min spend, usage limits, date windows, redemption tracking |
| Payments | Gross/refunded/net/unpaid totals, partial & full refunds, manual capture, Stripe re-sync, event ledger |
| Settings | Store-wide tax, shipping and invoice behaviour |
| Tax | Per-country/region rates in basis points, most specific match wins |
| Shipping | Multiple methods with price, min spend, country scope and free-over overrides |
| Currencies | Multi-currency display with per-currency rates |
| Payment methods | Card, Apple Pay, Google Pay, PayPal, bank transfer, cash on delivery |
| Audit log | Every privileged action with actor, before/after and IP |
| Settings | Team members, roles, password change |

### Roles

| Role | Can do |
| --- | --- |
| Owner | Everything, including adding/removing admins |
| Manager | Products, orders, customers, discounts, categories |
| Viewer | Read-only — no mutating forms are rendered at all |

Guards live in the server actions, not just the UI: a viewer who crafts a POST still gets redirected. The last active owner can't be demoted, disabled or removed.

Sessions live in the `AdminSession` table (8h expiry, token stored hashed), so signing out or changing a password revokes them server-side. A forged cookie is useless because there is no static admin secret any more.

### Audit trail

`/admin/audit` records: sign-in, failed sign-in, sign-out, admin created, password changed, order status changed, stock changed — each with actor, target, before/after metadata and IP. Writes go through `recordAudit()` in server actions, so they can't be skipped by the UI.

## Accounts

- `scrypt` password hashing with per-user salt (`src/lib/password.ts`)
- Opaque 32-byte session tokens, stored **hashed** in the `Session` table, httpOnly + SameSite=Lax cookie, 30-day expiry
- Orders placed while signed in are linked via `Order.userId`; guest orders stay unlinked and are only visible to the admin
- `next=` redirects are validated to same-origin paths, so `/login?next=//evil.example` can't be used as an open redirect

### Forgot password

`/forgot-password` → `/reset-password?token=…`

- 32-byte token, stored hashed, single use, 30-minute expiry
- Requesting a new link invalidates the previous one
- Resetting signs out **every** existing session for that account
- The request form returns the same message whether or not the email exists, so it can't be used to enumerate accounts
- **No mail provider is connected yet**: in development the reset link is shown on screen. Wire up Resend/Postmark in `requestPasswordReset()` and delete that branch before launch

### Rate limiting

Postgres-backed sliding window (`src/lib/rate-limit.ts`), no Redis required.

| Endpoint | Limit |
| --- | --- |
| Sign in | 20 / 15 min per IP, **5 / 15 min per account** |
| Sign up | 5 / 15 min per IP |
| Forgot password | 5 / 15 min per IP, 3 / 15 min per email |
| Reset submit | 10 / 15 min per IP |
| Admin sign in | 10 / 15 min per IP, 5 / 15 min per email |

The per-account bucket stops a distributed attack on one user; the per-IP bucket stops spraying. Note the limiter is per-process-database, so behind multiple app servers it still works (shared DB), but on serverless with connection pooling you may prefer Upstash Redis.

## Payments

Checkout writes a **pending** order, then depends on configuration:

| Config | Behaviour |
| --- | --- |
| `STRIPE_SECRET_KEY` set | Redirects to Stripe Checkout. The order becomes paid **only** from a verified webhook. |
| Not set | Demo mode — the order is marked paid immediately, no money moves. |

- Prices are read from the database at checkout time; the client cannot influence the amount
- `stripeSessionId` is unique, so a retry can't attach one Stripe session to two orders
- Refunds run through `refundOrder()` and are audited

Webhook endpoint: `POST /api/webhooks/stripe`

- Signature verified with `STRIPE_WEBHOOK_SECRET` (400 on mismatch)
- Replays are de-duplicated by event id (`WebhookEvent` table)
- Handles `checkout.session.completed`, `async_payment_succeeded`, `async_payment_failed`, `payment_intent.payment_failed`
- Without Stripe configured it returns 503 rather than silently accepting

Local testing:

```bash
stripe listen --forward-to localhost:3002/api/webhooks/stripe
```

## Email

Resend, via `RESEND_API_KEY` + `EMAIL_FROM`. Three templates: welcome, password reset, order confirmation.

Every send is recorded in `EmailMessage` with status `sent` / `failed` / `skipped`. **Without a key, nothing pretends to have been delivered** — it logs, records `skipped`, and in development the reset page shows the link so the flow is still usable.

Order confirmations are idempotent: the webhook and the demo path can't both send one.

## MCP server

The admin is exposed as an MCP server, so Claude Desktop, Cursor, Claude Code or any MCP client can operate the store in natural language.

Two transports, one tool surface (`src/lib/mcp/server.ts`):

| Transport | Endpoint | Use |
| --- | --- | --- |
| Streamable HTTP | `POST /api/mcp` | Remote clients, serverless-friendly |
| stdio | `npm run mcp` | Clients that launch a local process |

### Tokens

Create one at **/admin/mcp** (owners only). Tokens look like `drop_mcp_…`, are **hashed at rest**, and are shown once. Each token acts as the admin who issued it, inheriting that admin's role.

```bash
Authorization: Bearer drop_mcp_…
```

Revoking a token, or disabling its admin, takes effect on the next request. The HTTP transport is stateless — there is no session to hijack.

### Tools (19)

| Read | Write | Owner-only |
| --- | --- | --- |
| `whoami`, `store_overview` | `update_variant_stock` | `create_mcp_token` |
| `list_products`, `get_product` | `set_product_status` | `revoke_mcp_token` |
| `list_orders`, `get_order` | `update_order_status` | |
| `list_customers`, `list_discounts` | `ship_order`, `refund_order` | |
| `check_discount` (dry run) | `create_discount` | |
| | `set_customer_disabled`, `reset_customer_password` | |

- **Role enforcement lives in the tool layer**, not the client: a viewer token gets a clear error on any write, even if the client ignores the tool annotations.
- Every MCP write lands in the same `AuditLog` as the web admin, tagged `mcp.*`, with actor and before/after values.
- Tool annotations mark reads as `readOnlyHint` and refunds/password resets as `destructiveHint`, so clients can ask for confirmation.

### Client config

HTTP:

```json
{
  "mcpServers": {
    "drop-admin": {
      "url": "https://your-store.com/api/mcp",
      "headers": { "Authorization": "Bearer drop_mcp_…" }
    }
  }
}
```

stdio:

```json
{
  "mcpServers": {
    "drop-admin": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": { "DROP_MCP_TOKEN": "drop_mcp_…" }
    }
  }
}
```

## Scheduled jobs

`GET|POST /api/cron/cleanup` (requires `Authorization: Bearer $CRON_SECRET`):

- rate-limit rows older than 24h
- expired customer and admin sessions
- expired/used reset tokens
- email logs older than 30 days

```bash
npm run cron:cleanup
```

Schedule it hourly in production:

```json
// vercel.json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 * * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when that env var is set.

## Tax, shipping, currency and payment methods

Configured at `/admin/settings` and its sub-pages. The pricing pipeline lives in
`src/lib/checkout-service.ts` and is the only place that turns a cart into money:

1. **Lines** are re-priced from the database (never from the client).
2. **Discount** is applied to goods only.
3. **Shipping** is chosen from the methods that match the destination and subtotal. Only the cheapest tier inherits the store-wide free-shipping threshold, so Express and Next-day keep their price.
4. **Tax** resolves by country, then region: `US/CA` (7.25%) beats `US` (0%). Rates are basis points (`825` = 8.25%). Supports stacking (GST + PST), worldwide fallback via `*`, tax-on-shipping, and prices-include-tax extraction.
5. **Currency** converts for display; the order stores the rate it was charged at so history never drifts.

`POST /api/quote` exposes the same pipeline to the checkout UI, so the number the
customer sees is the number the server will charge.

### External integrations

Nothing is required to run the store — every integration degrades to a built-in
fallback. Configure at `/admin/integrations`, which shows live connection status.

| Integration | Env | Without it |
| --- | --- | --- |
| Stripe (card, Apple Pay, Google Pay) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Demo settlement |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Method hidden / demo |
| TaxJar | `TAXJAR_API_TOKEN`, `TAX_PROVIDER=taxjar` | Manual rates from `/admin/tax` |
| Stripe Tax | `STRIPE_TAX_ENABLED=true`, `TAX_PROVIDER=stripe_tax` | Manual rates |
| Exchange rates | `OPEN_EXCHANGE_RATES_APP_ID` or `EXCHANGE_RATE_API_KEY` | Rates edited by hand |

**Payment gateways** implement one interface (`src/lib/gateways/types.ts`):
`start`, `refund`, `verifyAndParse`. Checkout never branches on a provider name.
Apple Pay and Google Pay are not separate integrations — they surface through
Stripe Checkout once the domain is registered with Stripe.

**Tax engines** implement `TaxProvider` (`src/lib/tax-providers/types.ts`). If the
configured engine errors, checkout falls back to the manual rates rather than
blocking the customer, and logs the fallback.

**Exchange rates** refresh from the cron job at `/api/cron/cleanup` and on demand
from the integrations page. The rate is copied onto each order, so updating rates
never rewrites order history.

### Multi-currency

14 currencies ship enabled: USD, EUR, GBP, JPY, CNY, HKD, KRW, SGD, AUD, CAD, CHF, AED, INR, BRL.

- **Display follows the visitor**: `/de`, `/fr`, `/es` default to EUR; everything else defaults to USD. A cookie set by the header switcher overrides this, and the choice sticks across pages and locales.
- **Prices are stored once, in USD**, and converted at render time with `priceIn()` (`src/lib/price-format.ts`).
- **Orders freeze their rate** — `Order.fxRate` is written at checkout, so later rate changes never rewrite history. Account and receipt pages render at the stored rate, not today's.
- Admin can edit rates at `/admin/currencies` or refresh them from an FX provider (see Integrations).

`display-currency.ts` (server-only, reads cookies) is deliberately split from
`price-format.ts` (pure) so client components can format prices without pulling
`next/headers` into the browser bundle.

### Invoices

`GET /admin/orders/[id]/invoice` streams a PDF (admin-only, audited). Invoice numbers are allocated atomically from `StoreSettings.invoiceNextNumber` and cached per order, so re-downloading gives the same number.

## Discounts

Codes are validated on the server at checkout — the client can't invent a discount.

- `percentage` or `fixed`, optional minimum subtotal, usage limit, start/end window
- Per-email redemption limit, tracked in `DiscountRedemption`
- Checkout re-validates and the order stores `discountCode` / `discountAmount`
- Seed includes `WELCOME10`, `DROP20` (min $200), `SAVE15`, and an expired `EXPIRED` for testing

## Going live — what's left

1. **Payments** — the integration is complete; you just need to add real Stripe keys and point the webhook at your deployment.
2. **Database** — already Postgres. Point `DATABASE_URL` at your managed instance and run `npm run db:push` (or adopt `prisma migrate deploy` for versioned migrations).
3. **Images** — products currently use Unsplash URLs. Replace with your own photos (Next `<Image>` + a CDN, or Cloudinary).
4. **Email** — set `RESEND_API_KEY` and verify your sending domain in Resend, then remove the local fallback branch in `requestPasswordReset()`.
5. **Scheduled cleanup** — deploy with the cron in `vercel.json` (or any scheduler hitting `/api/cron/cleanup`), otherwise the rate-limit and email tables grow forever.
6. **Image uploads** — product images are still URLs, not file uploads.
7. **MCP over the network** — the HTTP endpoint authenticates with a bearer token; if you expose it publicly consider scoping tokens per-tool or adding IP allowlists.
8. **Tax compliance** — rates are static and manually maintained. For real cross-border selling you need a tax engine (TaxJar/Avalara) or Stripe Tax.
9. **SEO** — add `generateMetadata` per product, `sitemap.ts`, `robots.ts`.

## Layout

```
prisma/            schema + seed
src/app/           routes (/, shop, product/[slug], cart, checkout, account, admin, api/checkout)
src/components/    Header, Footer, ProductCard
src/lib/           db, catalog queries, money formatting, auth, password hashing, customer actions, zustand cart
```
