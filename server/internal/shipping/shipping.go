package shipping

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/money"
	"github.com/aivoai7/drop-store/server/internal/tax"
)

type Option struct {
	ID          string
	Name        string
	Description *string
	Price       money.Amount
	FreeOver    *money.Amount
}

type method struct {
	ID          string
	Name        string
	Description *string
	Price       money.Amount
	Countries   *string
	FreeOver    *money.Amount
	MinSubtotal money.Amount
}

// Options returns the methods that apply to a destination and subtotal,
// cheapest first. Only the cheapest tier inherits the store-wide free-shipping
// threshold, so express options keep their price.
func Options(ctx context.Context, pool *db.Pool, country string, subtotal money.Amount, globalFreeOver money.Amount) ([]Option, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, name, description, price, countries, "freeOver", "minSubtotal"
		FROM "ShippingMethod"
		WHERE active = true
		ORDER BY position, price`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []method
	for rows.Next() {
		var m method
		if err := rows.Scan(&m.ID, &m.Name, &m.Description, &m.Price, &m.Countries, &m.FreeOver, &m.MinSubtotal); err != nil {
			return nil, err
		}
		all = append(all, m)
	}

	code := tax.CountryCode(country)
	var eligible []method
	for _, m := range all {
		if m.Countries != nil {
			var list []string
			if err := json.Unmarshal([]byte(*m.Countries), &list); err == nil && len(list) > 0 {
				found := false
				for _, c := range list {
					if strings.EqualFold(c, code) {
						found = true
						break
					}
				}
				if !found {
					continue
				}
			}
		}
		if subtotal < m.MinSubtotal {
			continue
		}
		eligible = append(eligible, m)
	}

	if len(eligible) == 0 {
		// Never leave the customer with an unshippable cart.
		price := money.ShippingFee
		if subtotal >= globalFreeOver {
			price = 0
		}
		desc := "5–8 business days"
		return []Option{{ID: "standard", Name: "Standard shipping", Description: &desc, Price: price}}, nil
	}

	cheapest := eligible[0]
	for _, m := range eligible {
		if m.Price < cheapest.Price {
			cheapest = m
		}
	}

	out := make([]Option, 0, len(eligible))
	for _, m := range eligible {
		price := m.Price
		threshold := m.FreeOver
		if m.ID == cheapest.ID && m.FreeOver == nil {
			t := globalFreeOver
			threshold = &t
		}
		if threshold != nil && *threshold > 0 && subtotal >= *threshold {
			price = 0
		}
		out = append(out, Option{
			ID:          m.ID,
			Name:        m.Name,
			Description: m.Description,
			Price:       price,
			FreeOver:    m.FreeOver,
		})
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Price != out[j].Price {
			return out[i].Price < out[j].Price
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// Pick returns the requested method, or the cheapest when it isn't available.
func Pick(ctx context.Context, pool *db.Pool, methodID *string, country string, subtotal, globalFreeOver money.Amount) (Option, error) {
	opts, err := Options(ctx, pool, country, subtotal, globalFreeOver)
	if err != nil {
		return Option{}, err
	}
	if methodID != nil {
		for _, o := range opts {
			if o.ID == *methodID {
				return o, nil
			}
		}
	}
	return opts[0], nil
}
