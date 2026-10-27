package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"time"

	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/money"
)

type Sender struct {
	APIKey  string
	From    string
	BaseURL string
	HTTP    *http.Client
	Pool    *db.Pool
	Log     *slog.Logger
}

type Message struct {
	To       string
	Subject  string
	HTML     string
	Template string
}

// Send delivers through Resend when configured. Without a key it records the
// message as "skipped" so nothing silently pretends to have been delivered.
func (s *Sender) Send(ctx context.Context, msg Message) error {
	if s.APIKey == "" {
		s.Log.Info("email skipped", "template", msg.Template, "to", msg.To)
		s.record(ctx, msg, "none", "skipped", "RESEND_API_KEY not set")
		return nil
	}

	payload, _ := json.Marshal(map[string]any{
		"from":    s.From,
		"to":      []string{msg.To},
		"subject": msg.Subject,
		"html":    msg.HTML,
	})

	base := s.BaseURL
	if base == "" {
		base = "https://api.resend.com"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := s.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		s.record(ctx, msg, "resend", "failed", err.Error())
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode/100 != 2 {
		body := make([]byte, 512)
		n, _ := resp.Body.Read(body)
		reason := fmt.Sprintf("resend %d: %s", resp.StatusCode, string(body[:n]))
		s.record(ctx, msg, "resend", "failed", reason)
		return fmt.Errorf("%s", reason)
	}

	s.record(ctx, msg, "resend", "sent", "")
	return nil
}

func (s *Sender) record(ctx context.Context, msg Message, provider, status, errText string) {
	if s.Pool == nil {
		return
	}
	var errAny any
	if errText != "" {
		if len(errText) > 500 {
			errText = errText[:500]
		}
		errAny = errText
	}
	_, _ = s.Pool.Exec(ctx,
		`INSERT INTO "EmailMessage" (id, "to", subject, template, provider, status, error)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		newID(), msg.To, msg.Subject, msg.Template, provider, status, errAny)
}

func newID() string {
	b := make([]byte, 12)
	for i := range b {
		b[i] = byte('a' + i%26)
	}
	return fmt.Sprintf("em_%d", time.Now().UnixNano())
}

/* ----------------------------- templates ----------------------------- */

const (
	dark = "#050505"
	lime = "#bef264"
)

func layout(title, body string) string {
	return `<!doctype html>
<html><body style="margin:0;background:` + dark + `;color:#f5f5f5;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:18px;font-weight:900;letter-spacing:6px;margin:0 0 28px">DROP</p>
    <h1 style="font-size:26px;text-transform:uppercase;margin:0 0 16px">` + title + `</h1>
    ` + body + `
    <p style="margin-top:40px;font-size:11px;color:#888">DROP — thank you for your order.</p>
  </div>
</body></html>`
}

func row(label, value string) string {
	return `<tr><td style="padding:6px 0;color:#a3a3a3;font-size:13px">` + label +
		`</td><td style="padding:6px 0;text-align:right;font-size:13px">` + value + `</td></tr>`
}

// OrderConfirmation mirrors the TypeScript template, formatted in the order's
// own currency at the rate it was charged.
func OrderConfirmation(input struct {
	Name       string
	OrderID    string
	Total      money.Amount
	Currency   string
	Symbol     string
	Decimals   int
	FXRate     float64
	AccountURL string
	Items      []struct {
		Name     string
		Color    string
		Size     string
		Quantity int
		Price    money.Amount
	}
}) Message {
	formatMoney := func(a money.Amount) string {
		return money.FormatConverted(a, input.FXRate, input.Symbol, input.Decimals)
	}

	rows := ""
	for _, it := range input.Items {
		label := fmt.Sprintf("%s — %s / %s ×%d", html.EscapeString(it.Name), it.Color, it.Size, it.Quantity)
		rows += row(label, formatMoney(it.Price.Mul(it.Quantity)))
	}

	return Message{
		To:       "",
		Subject:  fmt.Sprintf("Order %s confirmed", input.OrderID),
		Template: "order-confirmation",
		HTML: layout("Order confirmed",
			`<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Thanks `+html.EscapeString(input.Name)+`. We're getting your order ready.</p>
       <p style="font-family:monospace;font-size:13px;color:`+lime+`">`+input.OrderID+`</p>
       <table style="width:100%;border-top:1px solid #262626;margin-top:16px">`+rows+
				row(`<strong>Total</strong>`, `<strong>`+formatMoney(input.Total)+`</strong>`)+`</table>
       <p style="margin:28px 0"><a href="`+input.AccountURL+`" style="background:`+lime+`;color:#000;padding:14px 22px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:2px;font-size:12px">View your orders</a></p>`),
	}
}
