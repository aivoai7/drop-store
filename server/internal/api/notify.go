package api

import (
	"context"

	"github.com/aivoai7/drop-store/server/internal/email"
	"github.com/aivoai7/drop-store/server/internal/money"
)

// sendOrderConfirmation is idempotent: it keys off an existing EmailMessage so
// a webhook retry or a double callback can't send twice.
func (s *Server) sendOrderConfirmation(ctx context.Context, orderID string) {
	var exists bool
	_ = s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM "EmailMessage"
			WHERE template = 'order-confirmation' AND subject LIKE '%' || $1 || '%'
		)`, orderID).Scan(&exists)
	if exists {
		return
	}

	var (
		emailAddr, name, currencyCode string
		total                         int64
		fxRate                        float64
	)
	err := s.pool.QueryRow(ctx,
		`SELECT email, name, total, currency, "fxRate" FROM "Order" WHERE id = $1`, orderID,
	).Scan(&emailAddr, &name, &total, &currencyCode, &fxRate)
	if err != nil {
		s.log.Error("order confirmation: load order", "err", err, "order", orderID)
		return
	}

	symbol, decimals := "$", 2
	_ = s.pool.QueryRow(ctx,
		`SELECT symbol, decimals FROM "Currency" WHERE code = $1`, currencyCode,
	).Scan(&symbol, &decimals)

	rows, err := s.pool.Query(ctx,
		`SELECT name, color, size, quantity, price FROM "OrderItem" WHERE "orderId" = $1`, orderID)
	if err != nil {
		return
	}
	defer rows.Close()

	var items []struct {
		Name     string
		Color    string
		Size     string
		Quantity int
		Price    money.Amount
	}
	for rows.Next() {
		var it struct {
			Name     string
			Color    string
			Size     string
			Quantity int
			Price    money.Amount
		}
		if err := rows.Scan(&it.Name, &it.Color, &it.Size, &it.Quantity, &it.Price); err == nil {
			items = append(items, it)
		}
	}

	msg := email.OrderConfirmation(struct {
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
	}{
		Name:       name,
		OrderID:    orderID,
		Total:      money.Amount(total),
		Currency:   currencyCode,
		Symbol:     symbol,
		Decimals:   decimals,
		FXRate:     fxRate,
		AccountURL: s.cfg.SiteURL + "/account",
		Items:      items,
	})
	msg.To = emailAddr

	if err := s.mailer.Send(ctx, msg); err != nil {
		s.log.Error("order confirmation email", "err", err, "order", orderID)
	}
}
