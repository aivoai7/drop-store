package discount

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/money"
)

type Discount struct {
	ID          string
	Code        string
	Type        string
	Value       int
	MinSubtotal money.Amount
	UsageLimit  *int
	UsedCount   int
	StartsAt    *time.Time
	EndsAt      *time.Time
	Active      bool
}

type Result struct {
	OK       bool
	Discount *Discount
	Amount   money.Amount
	Error    string
}

// Validate applies every rule in one place: existence, active flag, window,
// usage cap, minimum spend and per-email reuse.
func Validate(ctx context.Context, pool *db.Pool, rawCode string, subtotal money.Amount, email string) (Result, error) {
	code := strings.ToUpper(strings.TrimSpace(rawCode))
	if code == "" {
		return Result{Error: "Enter a code"}, nil
	}

	var d Discount
	err := pool.QueryRow(ctx, `
		SELECT id, code, type, value, "minSubtotal", "usageLimit", "usedCount",
		       "startsAt", "endsAt", active
		FROM "Discount" WHERE code = $1`, code,
	).Scan(&d.ID, &d.Code, &d.Type, &d.Value, &d.MinSubtotal, &d.UsageLimit,
		&d.UsedCount, &d.StartsAt, &d.EndsAt, &d.Active)
	if err != nil {
		return Result{Error: "That code isn't valid"}, nil
	}

	now := time.Now()
	if !d.Active {
		return Result{Error: "That code isn't valid"}, nil
	}
	if d.StartsAt != nil && d.StartsAt.After(now) {
		return Result{Error: "That code isn't active yet"}, nil
	}
	if d.EndsAt != nil && d.EndsAt.Before(now) {
		return Result{Error: "That code has expired"}, nil
	}
	if d.UsageLimit != nil && d.UsedCount >= *d.UsageLimit {
		return Result{Error: "That code has been fully redeemed"}, nil
	}
	if subtotal < d.MinSubtotal {
		return Result{
			Error: fmt.Sprintf("Spend at least $%d to use this code", d.MinSubtotal/100),
		}, nil
	}

	if email != "" {
		var used int
		_ = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM "DiscountRedemption" WHERE "discountId" = $1 AND email = $2`,
			d.ID, strings.ToLower(email),
		).Scan(&used)
		if used > 0 {
			return Result{Error: "You've already used this code"}, nil
		}
	}

	var amount money.Amount
	if d.Type == "percentage" {
		pct := d.Value
		if pct > 100 {
			pct = 100
		}
		amount = money.Amount(int64(subtotal) * int64(pct) / 100)
	} else {
		amount = money.Amount(d.Value)
		if amount > subtotal {
			amount = subtotal
		}
	}

	return Result{OK: true, Discount: &d, Amount: amount}, nil
}
