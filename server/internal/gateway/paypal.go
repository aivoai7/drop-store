package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type PaypalProvider struct {
	ClientID    string
	Secret      string
	WebhookID   string
	BaseURL     string
	HTTP        *http.Client
}

func (p *PaypalProvider) Code() Code { return Paypal }
func (p *PaypalProvider) Supports(method string) bool { return method == "paypal" }
func (p *PaypalProvider) Configured() bool {
	return p.ClientID != "" && p.Secret != ""
}

func (p *PaypalProvider) base() string {
	if p.BaseURL != "" {
		return strings.TrimRight(p.BaseURL, "/")
	}
	return "https://api-m.sandbox.paypal.com"
}

func (p *PaypalProvider) client() *http.Client {
	if p.HTTP != nil {
		return p.HTTP
	}
	return http.DefaultClient
}

func (p *PaypalProvider) token(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.base()+"/v1/oauth2/token",
		strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	basic := base64.StdEncoding.EncodeToString([]byte(p.ClientID + ":" + p.Secret))
	req.Header.Set("Authorization", "Basic "+basic)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.client().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("paypal auth %d: %s", resp.StatusCode, truncate(string(body), 160))
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	return out.AccessToken, nil
}

func (p *PaypalProvider) Start(ctx context.Context, in StartInput) (StartResult, error) {
	token, err := p.token(ctx)
	if err != nil {
		return StartResult{}, err
	}

	currency := strings.ToUpper(in.Currency)
	items := make([]map[string]any, 0, len(in.Lines)+2)
	var total int64
	for _, line := range in.Lines {
		amt := convert(line.Price, in.FXRate)
		total += amt * int64(line.Quantity)
		items = append(items, map[string]any{
			"name":        truncate(fmt.Sprintf("%s — %s / %s", line.Name, line.Color, line.Size), 127),
			"quantity":    fmt.Sprintf("%d", line.Quantity),
			"unit_amount": map[string]string{"currency_code": currency, "value": decimal(amt)},
		})
	}
	if in.Shipping > 0 {
		amt := convert(in.Shipping, in.FXRate)
		total += amt
		items = append(items, map[string]any{
			"name": "Shipping", "quantity": "1",
			"unit_amount": map[string]string{"currency_code": currency, "value": decimal(amt)},
		})
	}
	if in.TaxAmount > 0 {
		amt := convert(in.TaxAmount, in.FXRate)
		total += amt
		label := in.TaxLabel
		if label == "" {
			label = "Tax"
		}
		items = append(items, map[string]any{
			"name": truncate(label, 127), "quantity": "1",
			"unit_amount": map[string]string{"currency_code": currency, "value": decimal(amt)},
		})
	}

	payload := map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []map[string]any{{
			"reference_id": in.OrderID,
			"custom_id":    in.OrderID,
			"description":  truncate("Order "+in.OrderID, 127),
			"amount": map[string]any{
				"currency_code": currency,
				"value":         decimal(total),
				"breakdown": map[string]any{
					"item_total": map[string]string{"currency_code": currency, "value": decimal(total)},
				},
			},
			"items": items,
		}},
		"application_context": map[string]any{
			"brand_name":  "DROP",
			"user_action": "PAY_NOW",
			"return_url":  in.SuccessURL,
			"cancel_url":  in.CancelURL,
		},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.base()+"/v2/checkout/orders", bytes.NewReader(body))
	if err != nil {
		return StartResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client().Do(req)
	if err != nil {
		return StartResult{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return StartResult{}, fmt.Errorf("paypal order %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}

	var out struct {
		ID    string `json:"id"`
		Links []struct {
			Rel  string `json:"rel"`
			Href string `json:"href"`
		} `json:"links"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return StartResult{}, err
	}
	for _, l := range out.Links {
		if l.Rel == "approve" || l.Rel == "payer-action" {
			return StartResult{Kind: "redirect", URL: l.Href, Reference: out.ID}, nil
		}
	}
	return StartResult{}, fmt.Errorf("paypal did not return an approval link")
}

func (p *PaypalProvider) Refund(ctx context.Context, in RefundInput) (RefundResult, error) {
	token, err := p.token(ctx)
	if err != nil {
		return RefundResult{Error: err.Error()}, nil
	}
	payload := map[string]any{
		"amount": map[string]string{
			"currency_code": strings.ToUpper(in.Currency),
			"value":         decimal(in.AmountMinor),
		},
	}
	if in.Reason != "" {
		payload["note_to_payer"] = truncate(in.Reason, 255)
	}
	body, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/v2/payments/captures/%s/refund", p.base(), in.PaymentReference)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return RefundResult{Error: err.Error()}, nil
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client().Do(req)
	if err != nil {
		return RefundResult{Error: err.Error()}, nil
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return RefundResult{Error: fmt.Sprintf("paypal refund %d", resp.StatusCode)}, nil
	}
	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(respBody, &out)
	return RefundResult{OK: true, Reference: out.ID}, nil
}

func (p *PaypalProvider) ParseWebhook(r *http.Request, rawBody []byte) (Event, bool, error) {
	if p.WebhookID == "" || !p.Configured() {
		return Event{}, false, fmt.Errorf("paypal webhook not configured")
	}
	// PayPal verifies with a server-side call rather than a local HMAC.
	ctx := r.Context()
	token, err := p.token(ctx)
	if err != nil {
		return Event{}, false, err
	}

	var event map[string]any
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return Event{}, false, err
	}

	verify := map[string]any{
		"auth_algo":         r.Header.Get("Paypal-Auth-Algo"),
		"cert_url":          r.Header.Get("Paypal-Cert-Url"),
		"transmission_id":   r.Header.Get("Paypal-Transmission-Id"),
		"transmission_sig":  r.Header.Get("Paypal-Transmission-Sig"),
		"transmission_time": r.Header.Get("Paypal-Transmission-Time"),
		"webhook_id":        p.WebhookID,
		"webhook_event":     event,
	}
	body, _ := json.Marshal(verify)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.base()+"/v1/notifications/verify-webhook-signature", bytes.NewReader(body))
	if err != nil {
		return Event{}, false, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client().Do(req)
	if err != nil {
		return Event{}, false, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var verdict struct {
		Status string `json:"verification_status"`
	}
	_ = json.Unmarshal(respBody, &verdict)
	if verdict.Status != "SUCCESS" {
		return Event{}, false, fmt.Errorf("webhook signature rejected")
	}

	eventType, _ := event["event_type"].(string)
	resource, _ := event["resource"].(map[string]any)
	orderID, _ := resource["custom_id"].(string)
	if orderID == "" {
		if pus, ok := resource["purchase_units"].([]any); ok && len(pus) > 0 {
			if pu, ok := pus[0].(map[string]any); ok {
				orderID, _ = pu["custom_id"].(string)
				if orderID == "" {
					orderID, _ = pu["reference_id"].(string)
				}
			}
		}
	}
	ref, _ := resource["id"].(string)
	var amount int64
	if amt, ok := resource["amount"].(map[string]any); ok {
		if v, ok := amt["value"].(string); ok {
			amount = parseDecimal(v)
		}
	}

	switch eventType {
	case "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED":
		return Event{Type: "paid", OrderID: orderID, Reference: ref, AmountMinor: amount}, true, nil
	case "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED":
		return Event{Type: "failed", OrderID: orderID, Reason: eventType}, true, nil
	case "PAYMENT.CAPTURE.REFUNDED":
		return Event{Type: "refunded", Reference: ref, AmountMinor: amount}, true, nil
	}
	return Event{Type: "ignored"}, true, nil
}

func decimal(minor int64) string {
	return fmt.Sprintf("%d.%02d", minor/100, minor%100)
}

func parseDecimal(s string) int64 {
	var whole, frac int64
	if _, err := fmt.Sscanf(s, "%d.%d", &whole, &frac); err == nil {
		for frac > 99 {
			frac /= 10
		}
		return whole*100 + frac
	}
	var n int64
	fmt.Sscanf(s, "%d", &n)
	return n * 100
}
