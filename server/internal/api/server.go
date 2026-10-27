package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/aivoai7/drop-store/server/internal/config"
	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/gateway"
)

type Server struct {
	cfg      config.Config
	pool     *db.Pool
	gateways *gateway.Registry
	log      *slog.Logger
}

func New(cfg config.Config, pool *db.Pool, log *slog.Logger) *Server {
	return &Server{
		cfg:      cfg,
		pool:     pool,
		gateways: gateway.NewRegistry(&gateway.StripeProvider{SecretKey: cfg.StripeSecret, WebhookSecret: cfg.StripeWebhook}, &gateway.PaypalProvider{ClientID: cfg.PaypalClientID, Secret: cfg.PaypalSecret, WebhookID: cfg.PaypalWebhookID}),
		log:      log,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /v1/quote", s.handleQuote)
	mux.HandleFunc("POST /v1/checkout", s.handleCheckout)
	mux.HandleFunc("POST /v1/discount", s.handleDiscount)
	mux.HandleFunc("POST /v1/webhooks/stripe", s.handleStripeWebhook)
	mux.HandleFunc("POST /v1/webhooks/paypal", s.handlePaypalWebhook)

	return withRecovery(withLogging(s.log, withCORS(mux)))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}
