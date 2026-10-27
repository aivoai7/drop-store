package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aivoai7/drop-store/server/internal/discount"
	"github.com/aivoai7/drop-store/server/internal/gateway"
	"github.com/aivoai7/drop-store/server/internal/money"
	"github.com/aivoai7/drop-store/server/internal/ratelimit"
	"github.com/aivoai7/drop-store/server/internal/store"
)

// trustedProxies is how many reverse proxies sit in front of this service.
// The client fully controls the X-Forwarded-For chain, so only the entry this
// many hops from the right can be believed. 0 (default) ignores the header.
// Set TRUST_PROXIES=1 when nginx/Vercel is in front.
var trustedProxies = func() int {
	n, _ := strconv.Atoi(os.Getenv("TRUST_PROXIES"))
	return n
}()

// clientIP prefers the trusted X-Forwarded-For hop, then X-Real-IP, then the
// socket address. Untrusted header values never decide the rate-limit bucket.
func clientIP(r *http.Request) string {
	if trustedProxies >= 1 {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			parts := strings.Split(fwd, ",")
			if idx := len(parts) - trustedProxies; idx >= 0 {
				if v := strings.TrimSpace(parts[idx]); v != "" {
					return v
				}
			}
		}
		if real := r.Header.Get("X-Real-IP"); real != "" {
			return real
		}
	}
	host := r.RemoteAddr
	if i := strings.LastIndexByte(host, ':'); i > 0 {
		host = host[:i]
	}
	return host
}

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
		email := ""
		if u := s.sessionUser(ctx, r); u != nil {
			email = u.Email
		}
		subtotal := money.Amount(0)
		for _, l := range priced {
			subtotal += l.Price.Mul(l.Quantity)
		}
		res, err := discount.Validate(ctx, s.pool, *req.DiscountCode, subtotal, email)
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
	view := renderQuote(q, discountCode(disc), opts)
	view.Lines = lineViews(q, priced)
	view.Currencies, _ = s.activeCurrencies(ctx)
	view.PaymentMethods, _ = s.enabledPaymentMethods(ctx)
	writeJSON(w, http.StatusOK, view)
}

// lineViews renders per-line unit prices the way the TypeScript quote does.
func lineViews(q store.Quote, lines []store.PricedLine) []lineView {
	out := make([]lineView, 0, len(lines))
	for _, l := range lines {
		out = append(out, lineView{
			VariantID: l.VariantID,
			Unit:      money.FormatConverted(l.Price, q.FXRate, q.CurrencySymbol, q.CurrencyDecimals),
		})
	}
	return out
}

func (s *Server) activeCurrencies(ctx context.Context) ([]currencyOptionView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT code, name, symbol, rate, decimals FROM "Currency"
		 WHERE active = true ORDER BY position, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]currencyOptionView, 0)
	for rows.Next() {
		var c currencyOptionView
		if err := rows.Scan(&c.Code, &c.Name, &c.Symbol, &c.Rate, &c.Decimals); err == nil {
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

func (s *Server) enabledPaymentMethods(ctx context.Context) ([]paymentMethodView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT code, name, description, instructions, automated FROM "PaymentMethod"
		 WHERE enabled = true ORDER BY position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]paymentMethodView, 0)
	for rows.Next() {
		var m paymentMethodView
		if err := rows.Scan(&m.Code, &m.Name, &m.Description, &m.Instructions, &m.Automated); err == nil {
			out = append(out, m)
		}
	}
	return out, rows.Err()
}

// discountCode pulls the matched code out of a validation result.
func discountCode(d *discount.Result) string {
	if d == nil || d.Discount == nil {
		return ""
	}
	return d.Discount.Code
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

	lim, limErr := ratelimit.Limit(r.Context(), s.pool, "discount:"+clientIP(r), 20, 10*time.Minute)
	if limErr != nil {
		s.log.Error("rate limiter", "err", limErr)
	}
	if !lim.OK {
		writeError(w, http.StatusTooManyRequests,
			fmt.Sprintf("Too many attempts. Try again in %s.", ratelimit.FormatRetry(lim.RetryAfterSeconds)))
		return
	}
	res, err := discount.Validate(r.Context(), s.pool, req.Code, money.Amount(req.Subtotal), req.Email)
	if err != nil {
		s.log.Error("discount check", "err", err)
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
	// Attribution: the customer session cookie rides through the TS bridge.
	userID, sessionEmail := s.orderOwner(ctx, r)

	// Same budget as the TypeScript handler: 20 attempts per 10 minutes per IP.
	lim, err := ratelimit.Limit(ctx, s.pool, "checkout:"+clientIP(r), 20, 10*time.Minute)
	if err != nil {
		s.log.Error("rate limiter", "err", err)
	}
	if !lim.OK {
		writeError(w, http.StatusTooManyRequests,
			fmt.Sprintf("Too many checkout attempts. Try again in %s.", ratelimit.FormatRetry(lim.RetryAfterSeconds)))
		return
	}

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
		// Per-email discount limits use the account email when signed in; the
		// order email is client-typed and rotating it would dodge reuse caps.
		discountEmail := sessionEmail
		if discountEmail == "" {
			discountEmail = strings.ToLower(req.Email)
		}
		res, err := discount.Validate(ctx, s.pool, *req.DiscountCode, subtotal, discountEmail)
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
	// Mirrors the TypeScript "total must be greater than zero" guard; with
	// quantity bounds in PriceLines this shouldn't fire, but negative totals
	// must never reach settlement.
	if q.Total <= 0 {
		writeError(w, http.StatusBadRequest, "Order total must be greater than zero")
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
			id, "userId", email, name, address, city, region, country,
			subtotal, shipping, "taxAmount", "taxRate", "taxLabel",
			"discountCode", "discountAmount", total, currency, "fxRate",
			status, "paymentStatus", "paymentProvider", "paymentMethod",
			"shippingMethodId", "updatedAt"
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
		          'pending','pending',$19,$20,$21, now())`,
		orderID, userID, req.Email, req.Name, req.Address, req.City, req.Region, req.Country,
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
			newID(), disc.Discount.ID, orderID, redemptionEmail(sessionEmail, req.Email), int64(disc.Amount))
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
	s.sendOrderConfirmation(ctx, orderID)
	writeJSON(w, http.StatusOK, map[string]any{
		"orderId":     orderID,
		"redirectUrl": "/checkout/success?order=" + orderID,
	})
}

// orderOwner resolves the signed-in customer once per checkout: the user id
// for attribution and the email for per-email discount limits.
func (s *Server) orderOwner(ctx context.Context, r *http.Request) (any, string) {
	u := s.sessionUser(ctx, r)
	if u == nil {
		return nil, ""
	}
	return u.ID, u.Email
}

// redemptionEmail pins the redemption to the signed-in account email when
// there is one, falling back to the order email for guests.
func redemptionEmail(sessionEmail, orderEmail string) string {
	if sessionEmail != "" {
		return sessionEmail
	}
	return strings.ToLower(orderEmail)
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
	if !s.claimEvent(r.Context(), body, event) {
		writeJSON(w, http.StatusOK, map[string]any{"received": true, "duplicate": true})
		return
	}
	s.applyEvent(r.Context(), provider, event)
	writeJSON(w, http.StatusOK, map[string]any{"received": true})
}

// claimEvent records the provider event id so Stripe's retries don't apply the
// same state change twice. Returns false when the id was already seen.
func (s *Server) claimEvent(ctx context.Context, rawBody []byte, event gateway.Event) bool {
	var payload struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil || payload.ID == "" {
		return true // nothing to dedupe on
	}
	tag, err := s.pool.Exec(ctx,
		`INSERT INTO "WebhookEvent" (id, type) VALUES ($1,$2)
		 ON CONFLICT (id) DO NOTHING`,
		payload.ID, event.Type)
	if err != nil {
		// If the dedupe table itself fails, process anyway — the state machine
		// is idempotent for paid/refunded-by-reference.
		s.log.Error("webhook dedupe", "err", err)
		return true
	}
	return tag.RowsAffected() > 0
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
		s.sendOrderConfirmation(ctx, event.OrderID)
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
