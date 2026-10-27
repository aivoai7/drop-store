-- name: GetSettings :one
SELECT id, "baseCurrency", "taxEnabled", "taxBasis", "taxShipping",
       "fallbackTaxRate", "pricesIncludeTax", "freeShippingThreshold",
       "invoicePrefix", "invoiceNextNumber"
FROM "StoreSettings"
WHERE id = 'default';

-- name: ListActiveTaxRates :many
SELECT id, country, region, label, rate
FROM "TaxRate"
WHERE active = true;

-- name: ListActiveShippingMethods :many
SELECT id, name, description, price, countries, "freeOver", "minSubtotal"
FROM "ShippingMethod"
WHERE active = true
ORDER BY position, price;

-- name: GetCurrency :one
SELECT code, name, symbol, rate, decimals
FROM "Currency"
WHERE code = $1 AND active = true;

-- name: ListActiveCurrencies :many
SELECT code, name, symbol, rate, decimals
FROM "Currency"
WHERE active = true
ORDER BY position;

-- name: GetPaymentMethod :one
SELECT id, code, name, enabled, automated, instructions
FROM "PaymentMethod"
WHERE code = $1;
