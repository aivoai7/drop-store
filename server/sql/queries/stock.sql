-- name: DecrementVariantStock :exec
UPDATE "Variant"
SET stock = GREATEST(stock - $2, 0)
WHERE id = $1;

-- name: IncrementVariantStock :exec
UPDATE "Variant"
SET stock = stock + $2
WHERE id = $1;

-- name: RecalcProductStock :exec
UPDATE "Product"
SET stock = COALESCE((SELECT SUM(stock) FROM "Variant" WHERE "productId" = $1), 0)
WHERE id = $1;

-- name: SetOrderStockRestored :exec
UPDATE "Order" SET "stockRestored" = true WHERE id = $1;

-- name: GetOrderStockRestored :one
SELECT "stockRestored" FROM "Order" WHERE id = $1;
