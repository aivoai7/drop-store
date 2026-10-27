-- name: GetProductForCheckout :one
SELECT id, slug, name, price, status, stock, images, colors, sizes
FROM "Product"
WHERE id = $1;

-- name: GetVariantForCheckout :one
SELECT id, "productId", sku, color, size, stock, price
FROM "Variant"
WHERE id = $1;

-- name: GetActiveProducts :many
SELECT id, slug, name, price, status, stock, images
FROM "Product"
WHERE status = 'active'
ORDER BY position, "createdAt";

-- name: ListVariantsByProduct :many
SELECT id, sku, color, size, stock, price
FROM "Variant"
WHERE "productId" = $1
ORDER BY color, size;
