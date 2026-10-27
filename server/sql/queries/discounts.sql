-- name: GetDiscountByCode :one
SELECT id, code, type, value, "minSubtotal", "usageLimit", "usedCount",
       "startsAt", "endsAt", active
FROM "Discount"
WHERE code = $1;

-- name: CountRedemptionByEmail :one
SELECT COUNT(*) FROM "DiscountRedemption"
WHERE "discountId" = $1 AND email = $2;

-- name: RecordRedemption :exec
INSERT INTO "DiscountRedemption" (id, "discountId", "orderId", email, amount)
VALUES ($1, $2, $3, $4, $5);

-- name: IncrementDiscountUsage :exec
UPDATE "Discount" SET "usedCount" = "usedCount" + 1 WHERE id = $1;
