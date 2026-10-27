package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aivoai7/drop-store/server/internal/discount"
	"github.com/aivoai7/drop-store/server/internal/gateway"
	"github.com/aivoai7/drop-store/server/internal/money"
	"github.com/aivoai7/drop-store/server/internal/store"
)

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) loadSettings(ctx context.Context) (store.Settings, error) {
	var st store.Settings
	var threshold int64
	err := s.pool.QueryRow(ctx, `
		SELECT "baseCurrency", "taxEnabled", "taxBasis", "taxShipping",
		       "fallbackTaxRate", "pricesIncludeTax", "freeShippingThreshold"
		FROM "StoreSettings" WHERE id = 'default'`,
	).Scan(&st.BaseCurrency, &st.TaxEnabled, &st.TaxBasis, &st.TaxShipping,
		&st.FallbackTaxRate, &st.PricesIncludeTax, &threshold)
	st.FreeShippingThreshold = money.Amount(threshold)
	return st, err
}

/* ------------------------------ quote ------------------------------ */

type quoteRequest struct {
	Country          string           `json:"country"`
	Region           *string          `json:"region"`
	Currency         string           `json:"currency"`
	ShippingMethodID *string          `json:"shippingMethodId"`
	DiscountCode     *string          `json:"discountCode"`
	Items            []store.CartLine `json:"items"`
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	var req quoteRequest
	if !decode(w, r, &req) {
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "Cart is empty")
		return
	}

	ctx := r.Context()
	settings, err := s.loadSettings(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Settings unavailable")
		return
	}

	priced, problems, err := store.PriceLines(ctx, s.pool, req.Items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Pricing failed")
		return
	}
	if len(problems) > 0 {
		writeJSON(w, http.StatusConflict, map[string]any{"error": problems[0], "problems": problems})
		return
	}

	var disc *discount.Result
	if req.DiscountCode != nil && *req.DiscountCode != "" {
		subtotal := money.Amount(0)
		for _, l := range priced {
			subtotal += l.Price.Mul(l.Quantity)
		}
		res, err := discount.Validate(ctx, s.pool, *req.DiscountCode, subtotal, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Discount check failed")
			return
		}
		if !res.OK {
			writeError(w, http.StatusUnprocessableEntity, res.Error)
			return
		}
		disc = &res
	}

	country := req.Country
	if country == "" {
		country = "US"
	}
	q, err := store.BuildQuote(ctx, s.pool, settings, store.QuoteInput{
		Lines:            priced,
		Country:          country,
		Region:           req.Region,
		Currency:         req.Currency,
		ShippingMethodID: req.ShippingMethodID,
		Discount:         disc,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Quote failed")
		return
	}

	opts, _ := shippingOptionsFor(ctx, s, q, country)
	writeJSON(w, http.StatusOK, renderQuote(q, opts))
}

type shippingOptionView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Display     string `json:"display"`
	Price       int64  `json:"price"`
}

func shippingOptionsFor(ctx context.Context, s *Server, q store.Quote, country string) ([]shippingOptionView, error) {
	settings, err := s.loadSettings(ctx)
	if err != nil {
		return nil, err
	}
	opts, err := shippingOptions(ctx, s, country, q)
	_ = settings
	return opts, err
}

/* ---------------------------- discount ---------------------------- */

type discountRequest struct {
	Code     string `json:"code"`
	Subtotal int64  `json:"subtotal"`
	Email    string `json:"email"`
}

func (s *Server) handleDiscount(w http.ResponseWriter, r *http.Request) {
	var req discountRequest
	if !decode(w, r, &req) {
		return
	}
	res, err := discount.Validate(r.Context(), s.pool, req.Code, money.Amount(req.Subtotal), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Discount check failed")
		return
	}
	if !res.OK {
		writeError(w, http.StatusUnprocessableEntity, res.Error)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"code":   res.Discount.Code,
		"amount": int64(res.Amount),
	})
}

/* ---------------------------- checkout ---------------------------- */

type checkoutRequest struct {
	Email            string           `json:"email"`
	Name             string           `json:"name"`
	Address          string           `json:"address"`
	City             string           `json:"city"`
	Region           *string          `json:"region"`
	Country          string           `json:"country"`
	Currency         string           `json:"currency"`
	ShippingMethodID *string          `json:"shippingMethodId"`
	PaymentMethod    string           `json:"paymentMethod"`
	DiscountCode     *string          `json:"discountCode"`
	Items            []store.CartLine `json:"items"`
}

func (s *Server) handleCheckout(w http.ResponseWriter, r *http.Request) {
	var req checkoutRequest
	if !decode(w, r, &req) {
		return
	}
	if req.Email == "" || req.Name == "" || req.Address == "" || len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid order")
		return
	}

	ctx := r.Context()
	settings, err := s.loadSettings(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Settings unavailable")
		return
	}

	priced, problems, err := store.PriceLines(ctx, s.pool, req.Items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Pricing failed")
		return
	}
	if len(problems) > 0 {
		writeJSON(w, http.StatusConflict, map[string]any{"error": problems[0], "problems": problems})
		return
	}

	var disc *discount.Result
	if req.DiscountCode != nil && *req.DiscountCode != "" {
		subtotal := money.Amount(0)
		for _, l := range priced {
			subtotal += l.Price.Mul(l.Quantity)
		}
		res, err := discount.Validate(ctx, s.pool, *req.DiscountCode, subtotal, strings.ToLower(req.Email))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Discount check failed")
			return
		}
		if !res.OK {
			writeError(w, http.StatusUnprocessableEntity, res.Error)
			return
		}
		disc = &res
	}

	q, err := store.BuildQuote(ctx, s.pool, settings, store.QuoteInput{
		Lines:            priced,
		Country:          req.Country,
		Region:           req.Region,
		Currency:         req.Currency,
		ShippingMethodID: req.ShippingMethodID,
		Discount:         disc,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Quote failed")
		return
	}

	method := req.PaymentMethod
	if method == "" {
		method = "card"
	}
	var enabled, automated bool
	var methodName string
	err = s.pool.QueryRow(ctx,
		`SELECT name, enabled, automated FROM "PaymentMethod" WHERE code = $1`, method,
	).Scan(&methodName, &enabled, &automated)
	if err != nil || !enabled {
		writeError(w, http.StatusUnprocessableEntity, "That payment method isn't available")
		return
	}

	orderID := "DRP-" + strings.ToUpper(fmt.Sprintf("%d", time.Now().UnixNano())[8:])
	provider := s.gateways.For(method)
	providerCode := method
	if provider != nil {
		providerCode = string(provider.Code())
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO "Order" (
			id, email, name, address, city, region, country,
			subtotal, shipping, "taxAmount", "taxRate", "taxLabel",
			"discountCode", "discountAmount", total, currency, "fxRate",
			status, "paymentStatus", "paymentProvider", "paymentMethod",
			"shippingMethodId", "updatedAt"
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
		          'pending','pending',$18,$19,$20, now())`,
		orderID, req.Email, req.Name, req.Address, req.City, req.Region, req.Country,
		int64(q.Subtotal), int64(q.Shipping), int64(q.TaxAmount), q.TaxRate, q.TaxLabel,
		codeOrNil(disc), int64(q.DiscountAmount), int64(q.Total), q.Currency, q.FXRate,
		providerCode, method, q.ShippingMethodID)
	if err != nil {
		s.log.Error("create order", "err", err)
		writeError(w, http.StatusInternalServerError, "Could not create order")
		return
	}

	for i, line := range priced {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO "OrderItem" (id, "orderId", "productId", "variantId", sku, name, price, quantity, size, color)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			fmt.Sprintf("%s-%d", orderID, i), orderID, line.ProductID, line.VariantID,
			line.SKU, line.Name, int64(line.Price), line.Quantity, line.Size, line.Color)
		if err != nil {
			s.log.Error("create order item", "err", err)
		}
	}

	if disc != nil {
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO "DiscountRedemption" (id, "discountId", "orderId", email, amount)
			 VALUES ($1,$2,$3,$4,$5)`,
			newID(), disc.Discount.ID, orderID, strings.ToLower(req.Email), int64(disc.Amount))
		_, _ = s.pool.Exec(ctx, `UPDATE "Discount" SET "usedCount" = "usedCount" + 1 WHERE id = $1`, disc.Discount.ID)
	}

	if provider != nil {
		lines := make([]gateway.Line, 0, len(priced))
		for _, l := range priced {
			lines = append(lines, gateway.Line{
				Name: l.Name, Price: int64(l.Price), Quantity: l.Quantity,
				Size: l.Size, Color: l.Color, Image: l.Image,
			})
		}
		taxLabel := ""
		if q.TaxLabel != nil {
			taxLabel = *q.TaxLabel
		}
		started, err := provider.Start(ctx, gateway.StartInput{
			OrderID:    orderID,
			Email:      req.Email,
			Lines:      lines,
			Shipping:   int64(q.Shipping),
			TaxAmount:  int64(q.TaxAmount),
			TaxLabel:   taxLabel,
			Currency:   q.Currency,
			FXRate:     q.FXRate,
			SuccessURL: s.cfg.SiteURL + "/checkout/success?order=" + orderID,
			CancelURL:  s.cfg.SiteURL + "/checkout?cancelled=" + orderID,
		})
		if err != nil {
			s.log.Error("gateway start", "err", err)
			_, _ = s.pool.Exec(ctx,
				`UPDATE "Order" SET "paymentStatus"='failed', status='cancelled' WHERE id=$1`, orderID)
			writeError(w, http.StatusBadGateway, "Payment could not be started")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"orderId": orderID, "redirectUrl": started.URL})
		return
	}

	// Demo settlement: same path, minus the money.
	_, _ = s.pool.Exec(ctx, `
		UPDATE "Order" SET "paymentStatus"='paid',
		       status = CASE WHEN status='pending' THEN 'paid' ELSE status END
		WHERE id=$1`, orderID)
	s.reserveStock(ctx, orderID)
	writeJSON(w, http.StatusOK, map[string]any{
		"orderId":     orderID,
		"redirectUrl": "/checkout/success?order=" + orderID,
	})
}

func codeOrNil(d *discount.Result) any {
	if d == nil || d.Discount == nil {
		return nil
	}
	return d.Discount.Code
}

/* ---------------------------- webhooks ---------------------------- */

func (s *Server) handleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	provider := s.gateways.ByCode("stripe")
	if provider == nil || !provider.Configured() {
		writeError(w, http.StatusServiceUnavailable, "Stripe not configured")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	event, ok, err := provider.ParseWebhook(r, body)
	if err != nil || !ok {
		writeError(w, http.StatusBadRequest, "Invalid webhook")
		return
	}
	s.applyEvent(r.Context(), provider, event)
	writeJSON(w, http.StatusOK, map[string]any{"received": true})
}

func (s *Server) handlePaypalWebhook(w http.ResponseWriter, r *http.Request) {
	provider := s.gateways.ByCode("paypal")
	if provider == nil || !provider.Configured() {
		writeError(w, http.StatusServiceUnavailable, "PayPal not configured")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	event, ok, err := provider.ParseWebhook(r, body)
	if err != nil || !ok {
		writeError(w, http.StatusBadRequest, "Invalid webhook")
		return
	}
	s.applyEvent(r.Context(), provider, event)
	writeJSON(w, http.StatusOK, map[string]any{"received": true})
}

// applyEvent is the single state machine both providers share.
func (s *Server) applyEvent(ctx context.Context, provider gateway.Provider, event gateway.Event) {
	switch event.Type {
	case "ignored":
		return
	case "paid":
		if event.OrderID == "" {
			return
		}
		var status string
		err := s.pool.QueryRow(ctx, `SELECT "paymentStatus" FROM "Order" WHERE id=$1`, event.OrderID).Scan(&status)
		if err != nil || status == "paid" {
			return
		}
		s.reserveStock(ctx, event.OrderID)
		_, _ = s.pool.Exec(ctx, `
			UPDATE "Order"
			SET "paymentStatus"='paid',
			    status = CASE WHEN status='pending' THEN 'paid' ELSE status END,
			    "paymentReference" = COALESCE($2, "paymentReference"),
			    "updatedAt" = now()
			WHERE id=$1`, event.OrderID, nullIfEmpty(event.Reference))
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO "PaymentEvent" (id,"orderId",type,amount,provider,reference,actor)
			 VALUES ($1,$2,'payment.succeeded',$3,$4,$5,$6)`,
			newID(), event.OrderID, event.AmountMinor, string(provider.Code()), event.Reference, string(provider.Code())+"-webhook")
	case "failed":
		if event.OrderID != "" {
			_, _ = s.pool.Exec(ctx,
				`UPDATE "Order" SET "paymentStatus"='failed' WHERE id=$1 AND "paymentStatus"='pending'`,
				event.OrderID)
		}
	case "refunded":
		var orderID string
		var refunded, total int64
		err := s.pool.QueryRow(ctx,
			`SELECT id, "refundAmount", total FROM "Order"
			 WHERE "paymentReference"=$1 OR "stripePaymentIntentId"=$1 LIMIT 1`,
			event.Reference).Scan(&orderID, &refunded, &total)
		if err != nil {
			return
		}
		next := refunded + event.AmountMinor
		status := "partially_refunded"
		if next >= total {
			status = "refunded"
		}
		_, _ = s.pool.Exec(ctx,
			`UPDATE "Order" SET "refundAmount"=$2, "paymentStatus"=$3,
			   "refundedAt" = CASE WHEN $3='refunded' THEN now() ELSE "refundedAt" END
			 WHERE id=$1`, orderID, next, status)
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO "PaymentEvent" (id,"orderId",type,amount,provider,reference,actor)
			 VALUES ($1,$2,'refund.confirmed',$3,$4,$5,$6)`,
			newID(), orderID, event.AmountMinor, string(provider.Code()), event.Reference, string(provider.Code())+"-webhook")
	}
}

// reserveStock decrements every variant on the order and refreshes the cached
// product totals. Mirrors reserveOrderStock() in the TypeScript side.
func (s *Server) reserveStock(ctx context.Context, orderID string) {
	rows, err := s.pool.Query(ctx,
		`SELECT "variantId", "productId", quantity FROM "OrderItem" WHERE "orderId"=$1 AND "variantId" IS NOT NULL`,
		orderID)
	if err != nil {
		return
	}
	type item struct {
		variantID, productID string
		qty                  int
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.variantID, &it.productID, &it.qty); err == nil {
			items = append(items, it)
		}
	}
	rows.Close()

	for _, it := range items {
		_, _ = s.pool.Exec(ctx,
			`UPDATE "Variant" SET stock = GREATEST(stock - $2, 0) WHERE id = $1`, it.variantID, it.qty)
		_, _ = s.pool.Exec(ctx,
			`UPDATE "Product" SET stock = COALESCE((SELECT SUM(stock) FROM "Variant" WHERE "productId"=$1),0) WHERE id=$1`,
			it.productID)
	}
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
