package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// SignatureTolerance is how far a webhook timestamp may drift before we reject
// it, matching Stripe's own default of five minutes.
const SignatureTolerance = 5 * time.Minute

var (
	ErrMissingSignature = errors.New("missing stripe-signature header")
	ErrInvalidSignature = errors.New("stripe signature mismatch")
	ErrStaleSignature   = errors.New("stripe signature timestamp outside tolerance")
)

// VerifyStripeSignature checks the `Stripe-Signature` header against the raw
// request body using the endpoint's signing secret.
//
// Header format: t=<unix>,v1=<hex>[,v1=<hex>...]
// The signed payload is "<t>.<raw body>" and the digest is HMAC-SHA256.
func VerifyStripeSignature(header string, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return errors.New("webhook secret not configured")
	}
	if header == "" {
		return ErrMissingSignature
	}

	var timestamp int64
	var signatures []string

	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			ts, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				return ErrInvalidSignature
			}
			timestamp = ts
		case "v1":
			signatures = append(signatures, kv[1])
		}
	}

	if timestamp == 0 || len(signatures) == 0 {
		return ErrInvalidSignature
	}

	// Reject replayed payloads outside the tolerance window.
	age := now.Sub(time.Unix(timestamp, 0))
	if age > SignatureTolerance || age < -SignatureTolerance {
		return ErrStaleSignature
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.", timestamp)))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))

	// Stripe may send several v1 signatures during secret rotation; any match wins.
	for _, sig := range signatures {
		if hmac.Equal([]byte(expected), []byte(sig)) {
			return nil
		}
	}
	return ErrInvalidSignature
}
