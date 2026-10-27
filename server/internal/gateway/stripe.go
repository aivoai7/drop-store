package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type StripeProvider struct {
	SecretKey     string
	WebhookSecret string
	BaseURL       string // optional override for tests
	HTTP          *http.Client
}

func (s *StripeProvider) Code() Code { return Stripe }

func (s *StripeProvider) Supports(method string) bool {
	return method == "card" || method == "apple_pay" || method == "google_pay"
}

func (s *StripeProvider) Configured() bool { return s.SecretKey != "" }

func (s *StripeProvider) base() string {
	if s.BaseURL != "" {
		return strings.TrimRight(s.BaseURL, "/")
	}
	return "https://api.stripe.com"
}

func (s *StripeProvider) Start(ctx context.Context, in StartInput) (StartResult, error) {
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("customer_email", in.Email)
	form.Set("client_reference_id", in.OrderID)
	form.Set("metadata[orderId]", in.OrderID)
	form.Set("payment_intent_data[metadata][orderId]", in.OrderID)
	form.Set("success_url", in.SuccessURL)
	form.Set("cancel_url", in.CancelURL)

	currency := strings.ToLower(in.Currency)
	idx := 0
	add := func(name string, amount int64) {
		form.Set(fmt.Sprintf("line_items[%d][quantity]", idx), "1")
		form.Set(fmt.Sprintf("line_items[%d][price_data][currency]", idx), currency)
		form.Set(fmt.Sprintf("line_items[%d][price_data][unit_amount]", idx), fmt.Sprintf("%d", amount))
		form.Set(fmt.Sprintf("line_items[%d][price_data][product_data][name]", idx), name)
		idx++
	}

	for _, line := range in.Lines {
		form.Set(fmt.Sprintf("line_items[%d][quantity]", idx), fmt.Sprintf("%d", line.Quantity))
		form.Set(fmt.Sprintf("line_items[%d][price_data][currency]", idx), currency)
		form.Set(fmt.Sprintf("line_items[%d][price_data][unit_amount]", idx), fmt.Sprintf("%d", convert(line.Price, in.FXRate)))
		form.Set(fmt.Sprintf("line_items[%d][price_data][product_data][name]", idx), fmt.Sprintf("%s — %s / %s", line.Name, line.Color, line.Size))
		if line.Image != "" {
			form.Set(fmt.Sprintf("line_items[%d][price_data][product_data][images][0]", idx), line.Image)
		}
		idx++
	}
	if in.Shipping > 0 {
		add("Shipping", convert(in.Shipping, in.FXRate))
	}
	if in.TaxAmount > 0 {
		label := in.TaxLabel
		if label == "" {
			label = "Tax"
		}
		add(label, convert(in.TaxAmount, in.FXRate))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base()+"/v1/checkout/sessions",
		strings.NewReader(form.Encode()))
	if err != nil {
		return StartResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+s.SecretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client().Do(req)
	if err != nil {
		return StartResult{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return StartResult{}, fmt.Errorf("stripe %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var out struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return StartResult{}, err
	}
	return StartResult{Kind: "redirect", URL: out.URL, Reference: out.ID}, nil
}

func (s *StripeProvider) Refund(ctx context.Context, in RefundInput) (RefundResult, error) {
	form := url.Values{}
	form.Set("payment_intent", in.PaymentReference)
	form.Set("amount", fmt.Sprintf("%d", in.AmountMinor))
	if in.Reason != "" {
		form.Set("metadata[reason]", truncate(in.Reason, 200))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base()+"/v1/refunds",
		strings.NewReader(form.Encode()))
	if err != nil {
		return RefundResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+s.SecretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client().Do(req)
	if err != nil {
		return RefundResult{Error: err.Error()}, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return RefundResult{Error: fmt.Sprintf("stripe %d: %s", resp.StatusCode, truncate(string(body), 160))}, nil
	}
	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(body, &out)
	return RefundResult{OK: true, Reference: out.ID}, nil
}

// ParseWebhook verifies the signature and maps the event. Signature
// verification is delegated to the TypeScript side when the secret is absent,
// so a missing secret fails closed rather than accepting forged events.
func (s *StripeProvider) ParseWebhook(r *http.Request, rawBody []byte) (Event, bool, error) {
	// Verify before parsing: an unsigned payload must never reach the mapper.
	if err := VerifyStripeSignature(r.Header.Get("Stripe-Signature"), rawBody, s.WebhookSecret, time.Now()); err != nil {
		return Event{}, false, err
	}
	var payload struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Data struct {
			Object map[string]any `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return Event{}, false, err
	}

	obj := payload.Data.Object
	switch payload.Type {
	case "checkout.session.completed", "checkout.session.async_payment_succeeded":
		orderID, _ := obj["client_reference_id"].(string)
		if orderID == "" {
			if md, ok := obj["metadata"].(map[string]any); ok {
				orderID, _ = md["orderId"].(string)
			}
		}
		ref, _ := obj["payment_intent"].(string)
		amount := asInt(obj["amount_total"])
		return Event{Type: "paid", OrderID: orderID, Reference: ref, AmountMinor: amount}, true, nil
	case "checkout.session.async_payment_failed", "payment_intent.payment_failed":
		orderID := ""
		if md, ok := obj["metadata"].(map[string]any); ok {
			orderID, _ = md["orderId"].(string)
		}
		return Event{Type: "failed", OrderID: orderID, Reason: payload.Type}, true, nil
	case "charge.refunded", "refund.created", "refund.updated":
		ref, _ := obj["payment_intent"].(string)
		return Event{Type: "refunded", Reference: ref, AmountMinor: asInt(obj["amount"])}, true, nil
	}
	return Event{Type: "ignored"}, true, nil
}

func (s *StripeProvider) client() *http.Client {
	if s.HTTP != nil {
		return s.HTTP
	}
	return http.DefaultClient
}

func convert(base int64, rate float64) int64 {
	if rate == 0 || rate == 1 {
		return base
	}
	return int64(float64(base)*rate + 0.5)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func asInt(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}
