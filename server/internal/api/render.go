package api

import (
	"context"

	"github.com/aivoai7/drop-store/server/internal/money"
	"github.com/aivoai7/drop-store/server/internal/shipping"
	"github.com/aivoai7/drop-store/server/internal/store"
)

type quoteView struct {
	Currency       currencyView          `json:"currency"`
	ShippingOptions []shippingOptionView `json:"shippingOptions"`
	ShippingMethodID string              `json:"shippingMethodId"`
	Tax            taxView               `json:"tax"`
	Discount       *discountView         `json:"discount"`
	Amounts        amountsView           `json:"amounts"`
}

type currencyView struct {
	Code     string `json:"code"`
	Symbol   string `json:"symbol"`
	Decimals int    `json:"decimals"`
}

type taxView struct {
	Enabled bool   `json:"enabled"`
	Rate    int    `json:"rate"`
	Label   string `json:"label"`
	Display string `json:"display"`
}

type discountView struct {
	Code    string `json:"code"`
	Display string `json:"display"`
}

type amountsView struct {
	Subtotal string `json:"subtotal"`
	Shipping string `json:"shipping"`
	Tax      string `json:"tax"`
	Total    string `json:"total"`
}

func fmtAmount(a money.Amount, q store.Quote) string {
	return money.FormatConverted(a, q.FXRate, q.CurrencySymbol, q.CurrencyDecimals)
}

func renderQuote(q store.Quote, opts []shippingOptionView) quoteView {
	label := ""
	if q.TaxLabel != nil {
		label = *q.TaxLabel
	}
	v := quoteView{
		Currency: currencyView{
			Code:     q.Currency,
			Symbol:   q.CurrencySymbol,
			Decimals: q.CurrencyDecimals,
		},
		ShippingOptions:  opts,
		ShippingMethodID: q.ShippingMethodID,
		Tax: taxView{
			Enabled: q.TaxRate > 0,
			Rate:    q.TaxRate,
			Label:   label,
			Display: fmtAmount(q.TaxAmount, q),
		},
		Amounts: amountsView{
			Subtotal: fmtAmount(q.Subtotal, q),
			Shipping: fmtAmount(q.Shipping, q),
			Tax:      fmtAmount(q.TaxAmount, q),
			Total:    fmtAmount(q.Total, q),
		},
	}
	if q.DiscountAmount > 0 {
		code := ""
		v.Discount = &discountView{Code: code, Display: fmtAmount(q.DiscountAmount, q)}
	}
	return v
}

func shippingOptions(ctx context.Context, s *Server, country string, q store.Quote) ([]shippingOptionView, error) {
	settings, err := s.loadSettings(ctx)
	if err != nil {
		return nil, err
	}
	opts, err := shipping.Options(ctx, s.pool, country, q.Subtotal.Sub(q.DiscountAmount), settings.FreeShippingThreshold)
	if err != nil {
		return nil, err
	}
	out := make([]shippingOptionView, 0, len(opts))
	for _, o := range opts {
		desc := ""
		if o.Description != nil {
			desc = *o.Description
		}
		out = append(out, shippingOptionView{
			ID:          o.ID,
			Name:        o.Name,
			Description: desc,
			Display:     money.FormatConverted(o.Price, q.FXRate, q.CurrencySymbol, q.CurrencyDecimals),
			Price:       int64(o.Price),
		})
	}
	return out, nil
}
