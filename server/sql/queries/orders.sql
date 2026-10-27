-- name: CreateOrder :one
INSERT INTO "Order" (
  id, "userId", email, name, address, city, region, country,
  subtotal, shipping, "taxAmount", "taxRate", "taxLabel",
  "discountCode", "discountAmount", total, currency, "fxRate",
  status, "paymentStatus", "paymentProvider", "paymentMethod",
  "shippingMethodId", "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8,
  $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18,
  'pending', 'pending', $19, $20,
  $21, now()
)
RETURNING id, total, currency, "fxRate";

-- name: CreateOrderItem :exec
INSERT INTO "OrderItem" (
  id, "orderId", "productId", "variantId", sku, name, price, quantity, size, color
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- name: MarkOrderPaid :one
UPDATE "Order"
SET "paymentStatus" = 'paid',
    status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END,
    "paymentReference" = COALESCE($2, "paymentReference"),
    "updatedAt" = now()
WHERE id = $1
RETURNING id, email, name, total, currency, "fxRate";

-- name: GetOrder :one
SELECT id, "userId", email, name, address, city, region, country,
       subtotal, shipping, "taxAmount", "taxRate", "taxLabel",
       "discountCode", "discountAmount", total, currency, "fxRate",
       status, "paymentStatus", "paymentProvider", "paymentReference",
       "stripePaymentIntentId", "refundAmount", "trackingNumber",
       "createdAt"
FROM "Order"
WHERE id = $1;

-- name: GetOrderItems :many
SELECT id, "productId", "variantId", sku, name, price, quantity, size, color
FROM "OrderItem"
WHERE "orderId" = $1;

-- name: FindOrderByPaymentRef :one
SELECT id FROM "Order"
WHERE "paymentReference" = $1 OR "stripePaymentIntentId" = $1
LIMIT 1;

-- name: ApplyRefund :one
UPDATE "Order"
SET "refundAmount" = "refundAmount" + $2,
    "paymentStatus" = CASE
      WHEN "refundAmount" + $2 >= total THEN 'refunded'
      ELSE 'partially_refunded'
    END,
    "refundedAt" = CASE WHEN "refundAmount" + $2 >= total THEN now() ELSE "refundedAt" END,
    "updatedAt" = now()
WHERE id = $1
RETURNING id, "refundAmount", "paymentStatus", total;

-- name: MarkOrderFailed :exec
UPDATE "Order"
SET "paymentStatus" = 'failed', "updatedAt" = now()
WHERE id = $1 AND "paymentStatus" = 'pending';
