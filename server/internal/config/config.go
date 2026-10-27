package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds everything the API service needs from the environment.
type Config struct {
	DatabaseURL string
	Port        string
	SiteURL     string
	AppSecret   string

	StripeSecret    string
	StripeWebhook   string
	StripeAPIBase   string
	PaypalClientID  string
	PaypalSecret    string
	PaypalWebhookID string
	PaypalAPIBase   string

	ResendAPIKey  string
	ResendBaseURL string
	EmailFrom     string

	TaxProvider   string
	TaxJarToken   string
	TaxJarAPIBase string

	SessionCookie string
}

func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", ""),
		Port:        env("GO_API_PORT", "8081"),
		SiteURL:     strings.TrimRight(env("SITE_URL", "http://localhost:3002"), "/"),
		AppSecret:   env("APP_SECRET", ""),

		StripeSecret:    env("STRIPE_SECRET_KEY", ""),
		StripeWebhook:   env("STRIPE_WEBHOOK_SECRET", ""),
		StripeAPIBase:   env("STRIPE_API_BASE", ""),
		PaypalClientID:  env("PAYPAL_CLIENT_ID", ""),
		PaypalSecret:    env("PAYPAL_CLIENT_SECRET", ""),
		PaypalWebhookID: env("PAYPAL_WEBHOOK_ID", ""),
		PaypalAPIBase:   env("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com"),

		ResendAPIKey:  env("RESEND_API_KEY", ""),
		ResendBaseURL: env("RESEND_BASE_URL", ""),
		EmailFrom:     env("EMAIL_FROM", "DROP <onboarding@resend.dev>"),

		TaxProvider:   env("TAX_PROVIDER", ""),
		TaxJarToken:   env("TAXJAR_API_TOKEN", ""),
		TaxJarAPIBase: env("TAXJAR_API_BASE", "https://api.sandbox.taxjar.com"),

		SessionCookie: env("SESSION_COOKIE", "drop_session"),
	}
}

// StripeEnabled reports whether card payments can actually settle.
func (c Config) StripeEnabled() bool { return c.StripeSecret != "" }

// StripeBaseURL lets tests point the SDK at a local stub.
func (c Config) StripeBaseURL() string { return c.StripeAPIBase }

func (c Config) PaypalEnabled() bool {
	return c.PaypalClientID != "" && c.PaypalSecret != ""
}

// SessionHashSecret is used to hash session tokens; falls back to the app secret
// so a single env var is enough in small deployments.
func (c Config) SessionHashSecret() string {
	if c.AppSecret != "" {
		return c.AppSecret
	}
	return "drop-session-fallback"
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

var _ = envInt
