package store

import (
	"context"
	"encoding/json"

	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/discount"
	"github.com/aivoai7/drop-store/server/internal/money"
	"github.com/aivoai7/drop-store/server/internal/shipping"
	"github.com/aivoai7/drop-store/server/internal/tax"
)

type CartLine struct {
	ProductID string `json:"productId"`
	VariantID string `json:"variantId"`
	Quantity  int    `json:"quantity"`
}

type PricedLine struct {
	ProductID string
	VariantID string
	SKU       string
	Name      string
	Price     money.Amount
	Quantity  int
	Size      string
	Color     string
	Image     string
}

type Settings struct {
	BaseCurrency          string
	TaxEnabled            bool
	TaxBasis              string
	TaxShipping           bool
	FallbackTaxRate       int
	PricesIncludeTax      bool
	FreeShippingThreshold money.Amount
}

type Quote struct {
	Lines             []PricedLine
	Subtotal          money.Amount
	Shipping          money.Amount
	ShippingMethodID  string
	ShippingMethodName string
	TaxAmount         money.Amount
	TaxRate           int
	TaxLabel          *string
	DiscountAmount    money.Amount
	Total             money.Amount
	Currency          string
	FXRate            float64
	CurrencyName      string
	CurrencySymbol    string
	CurrencyDecimals  int
}

// PriceLines re-prices a cart from the database. Nothing the client sends about
// price, name or stock is trusted.
func PriceLines(ctx context.Context, pool *db.Pool, lines []CartLine) ([]PricedLine, []string, error) {
	priced := make([]PricedLine, 0, len(lines))
	var problems []string

	for _, line := range lines {
		var (
			productID, name, status, imagesJSON string
			productPrice                        int64
		)
		err := pool.QueryRow(ctx,
			`SELECT id, name, price, status, images FROM "Product" WHERE id = $1`,
			line.ProductID,
		).Scan(&productID, &name, &productPrice, &status, &imagesJSON)
		if err != nil {
			problems = append(problems, "A product in your bag is no longer available.")
			continue
		}
		if status != "active" {
			problems = append(problems, name+" is no longer for sale.")
			continue
		}

		var (
			variantID, sku, color, size string
			stock                       int
			variantPrice                *int64
		)
		err = pool.QueryRow(ctx,
			`SELECT id, "productId", sku, color, size, stock, price FROM "Variant" WHERE id = $1`,
			line.VariantID,
		).Scan(&variantID, &productID, &sku, &color, &size, &stock, &variantPrice)
		if err != nil {
			problems = append(problems, "A product in your bag is no longer available.")
			continue
		}
		if stock < line.Quantity {
			problems = append(problems, "Not enough stock for "+name+".")
			continue
		}

		price := money.Amount(productPrice)
		if variantPrice != nil {
			price = money.Amount(*variantPrice)
		}

		var images []string
		_ = json.Unmarshal([]byte(imagesJSON), &images)
		image := ""
		if len(images) > 0 {
			image = images[0]
		}

		priced = append(priced, PricedLine{
			ProductID: productID,
			VariantID: variantID,
			SKU:       sku,
			Name:      name,
			Price:     price,
			Quantity:  line.Quantity,
			Size:      size,
			Color:     color,
			Image:     image,
		})
	}

	return priced, problems, nil
}

type QuoteInput struct {
	Lines            []PricedLine
	Country          string
	Region           *string
	Currency         string
	ShippingMethodID *string
	Discount         *discount.Result
}

// BuildQuote is the single place a priced cart becomes money on screen.
func BuildQuote(ctx context.Context, pool *db.Pool, settings Settings, in QuoteInput) (Quote, error) {
	subtotal := money.Amount(0)
	for _, l := range in.Lines {
		subtotal += l.Price.Mul(l.Quantity)
	}

	option, err := shipping.Pick(ctx, pool, in.ShippingMethodID, in.Country, subtotal, settings.FreeShippingThreshold)
	if err != nil {
		return Quote{}, err
	}

	var discountAmount money.Amount
	if in.Discount != nil && in.Discount.OK {
		discountAmount = in.Discount.Amount
		if discountAmount > subtotal {
			discountAmount = subtotal
		}
	}
	discountedGoods := subtotal.Sub(discountAmount)

	var taxAmount money.Amount
	var taxRate int
	var taxLabel *string

	if settings.TaxEnabled {
		base := discountedGoods
		if settings.TaxBasis == "shipping" || settings.TaxShipping {
			base = base.Add(option.Price)
		}
		rate, label := tax.ResolveRate(ctx, pool, in.Country, in.Region)
		if rate == 0 {
			rate = settings.FallbackTaxRate
			if rate > 0 && label == nil {
				l := "Tax"
				label = &l
			}
		}
		amount, applied := tax.Compute(base, rate, settings.PricesIncludeTax)
		taxAmount = amount
		taxRate = applied
		taxLabel = label
	}

	total := discountedGoods.Add(option.Price)
	if !settings.PricesIncludeTax {
		total = total.Add(taxAmount)
	}

	currencyCode := settings.BaseCurrency
	fxRate := 1.0
	currencyName := "US Dollar"
	symbol := "$"
	decimals := 2

	if in.Currency != "" {
		var name, sym string
		var rate float64
		var dec int
		err := pool.QueryRow(ctx,
			`SELECT code, name, symbol, rate, decimals FROM "Currency" WHERE code = $1 AND active = true`,
			in.Currency,
		).Scan(&currencyCode, &name, &sym, &rate, &dec)
		if err == nil {
			currencyName, symbol, fxRate, decimals = name, sym, rate, dec
		}
	}

	return Quote{
		Lines:              in.Lines,
		Subtotal:           subtotal,
		Shipping:           option.Price,
		ShippingMethodID:   option.ID,
		ShippingMethodName: option.Name,
		TaxAmount:          taxAmount,
		TaxRate:            taxRate,
		TaxLabel:           taxLabel,
		DiscountAmount:     discountAmount,
		Total:              total,
		Currency:           currencyCode,
		FXRate:             fxRate,
		CurrencyName:       currencyName,
		CurrencySymbol:     symbol,
		CurrencyDecimals:   decimals,
	}, nil
}
