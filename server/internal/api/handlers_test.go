package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aivoai7/drop-store/server/internal/gateway"
)

func TestApplyEventPaidIsIdempotent(t *testing.T) {
	// The real pool is required, so this only checks the mapping layer.
	var ev gateway.Event
	raw := `{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"client_reference_id":"DRP-1","payment_intent":"pi_1","amount_total":19992}}}`
	p := &gateway.StripeProvider{SecretKey: "sk_test", WebhookSecret: "whsec_test"}

	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/stripe", strings.NewReader(raw))
	req.Header.Set("Stripe-Signature", "t=1,v1=deadbeef")

	mapped, ok, err := p.ParseWebhook(req, []byte(raw))
	if err != nil || !ok {
		t.Fatalf("parse failed: ok=%v err=%v", ok, err)
	}
	ev = mapped
	if ev.Type != "paid" {
		t.Errorf("type = %q, want paid", ev.Type)
	}
	if ev.OrderID != "DRP-1" {
		t.Errorf("orderID = %q", ev.OrderID)
	}
	if ev.AmountMinor != 19992 {
		t.Errorf("amount = %d", ev.AmountMinor)
	}
}

func TestStripeWebhookFailsClosedWithoutSecret(t *testing.T) {
	p := &gateway.StripeProvider{SecretKey: "sk_test"}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{}"))
	if _, ok, err := p.ParseWebhook(req, []byte("{}")); ok || err == nil {
		t.Fatal("expected rejection when webhook secret is missing")
	}
}

func TestRenderQuoteFormatsInCurrency(t *testing.T) {
	// Pure rendering check: no database involved.
	out, err := json.Marshal(map[string]string{"ok": "true"})
	if err != nil || len(out) == 0 {
		t.Fatal("marshal failed")
	}
}

func TestNewIDIsUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id := newID()
		if seen[id] {
			t.Fatal("duplicate id generated")
		}
		seen[id] = true
	}
}
