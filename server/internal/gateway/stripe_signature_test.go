package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

func sign(body string, secret string, ts int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.", ts)))
	mac.Write([]byte(body))
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

func TestVerifyStripeSignature(t *testing.T) {
	const secret = "whsec_test"
	const body = `{"id":"evt_1","type":"checkout.session.completed"}`
	now := time.Unix(1_700_000_000, 0)

	t.Run("valid", func(t *testing.T) {
		if err := VerifyStripeSignature(sign(body, secret, now.Unix()), []byte(body), secret, now); err != nil {
			t.Fatalf("expected valid, got %v", err)
		}
	})

	t.Run("wrong secret", func(t *testing.T) {
		if err := VerifyStripeSignature(sign(body, "other", now.Unix()), []byte(body), secret, now); err == nil {
			t.Fatal("expected mismatch")
		}
	})

	t.Run("tampered body", func(t *testing.T) {
		header := sign(body, secret, now.Unix())
		if err := VerifyStripeSignature(header, []byte(body+" "), secret, now); err == nil {
			t.Fatal("expected mismatch after body change")
		}
	})

	t.Run("stale timestamp", func(t *testing.T) {
		old := now.Add(-10 * time.Minute)
		if err := VerifyStripeSignature(sign(body, secret, old.Unix()), []byte(body), secret, now); err != ErrStaleSignature {
			t.Fatalf("expected stale, got %v", err)
		}
	})

	t.Run("missing header", func(t *testing.T) {
		if err := VerifyStripeSignature("", []byte(body), secret, now); err != ErrMissingSignature {
			t.Fatalf("expected missing, got %v", err)
		}
	})

	t.Run("no secret configured", func(t *testing.T) {
		if err := VerifyStripeSignature(sign(body, "", now.Unix()), []byte(body), "", now); err == nil {
			t.Fatal("expected failure without a secret")
		}
	})

	t.Run("multiple v1 signatures during rotation", func(t *testing.T) {
		valid := sign(body, secret, now.Unix())
		header := valid + ",v1=deadbeef"
		if err := VerifyStripeSignature(header, []byte(body), secret, now); err != nil {
			t.Fatalf("expected valid with rotation header, got %v", err)
		}
	})
}
