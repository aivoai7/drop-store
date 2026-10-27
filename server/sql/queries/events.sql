-- name: RecordPaymentEvent :exec
INSERT INTO "PaymentEvent" (id, "orderId", type, amount, provider, reference, actor, note)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: RecordWebhookEvent :exec
INSERT INTO "WebhookEvent" (id, type) VALUES ($1, $2)
ON CONFLICT (id) DO NOTHING;

-- name: WebhookSeen :one
SELECT EXISTS(SELECT 1 FROM "WebhookEvent" WHERE id = $1);

-- name: RecordEmail :exec
INSERT INTO "EmailMessage" (id, "to", subject, template, provider, status, error)
VALUES ($1, $2, $3, $4, $5, $6, $7);
