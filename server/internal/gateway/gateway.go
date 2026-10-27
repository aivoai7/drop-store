package gateway

import (
	"context"
	"net/http"
)

// Code identifies a provider.
type Code string

const (
	Stripe Code = "stripe"
	Paypal Code = "paypal"
)

type Line struct {
	Name     string
	Price    int64 // base cents
	Quantity int
	Size     string
	Color    string
	Image    string
}

type StartInput struct {
	OrderID    string
	Email      string
	Lines      []Line
	Shipping   int64
	TaxAmount  int64
	TaxLabel   string
	Currency   string
	FXRate     float64
	SuccessURL string
	CancelURL  string
}

type StartResult struct {
	Kind      string // "redirect" | "deferred"
	URL       string
	Reference string
}

type RefundInput struct {
	OrderID          string
	PaymentReference string
	AmountMinor      int64
	Currency         string
	Reason           string
}

type RefundResult struct {
	OK        bool
	Reference string
	Error     string
}

// Event is the normalised webhook payload both providers map onto.
type Event struct {
	Type       string // paid | failed | refunded | ignored
	OrderID    string
	Reference  string
	AmountMinor int64
	Reason     string
}

// Provider is the contract each gateway implements.
type Provider interface {
	Code() Code
	Supports(method string) bool
	Configured() bool
	Start(ctx context.Context, in StartInput) (StartResult, error)
	Refund(ctx context.Context, in RefundInput) (RefundResult, error)
	ParseWebhook(r *http.Request, rawBody []byte) (Event, bool, error)
}

// Registry resolves the provider that handles a payment method.
type Registry struct {
	providers []Provider
}

func NewRegistry(providers ...Provider) *Registry {
	return &Registry{providers: providers}
}

func (r *Registry) For(method string) Provider {
	for _, p := range r.providers {
		if p.Supports(method) && p.Configured() {
			return p
		}
	}
	return nil
}

func (r *Registry) ByCode(code string) Provider {
	for _, p := range r.providers {
		if string(p.Code()) == code {
			return p
		}
	}
	return nil
}
