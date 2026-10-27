package tax

import (
	"context"
	"strings"

	"github.com/aivoai7/drop-store/server/internal/db"
	"github.com/aivoai7/drop-store/server/internal/money"
)

type Rate struct {
	ID      string
	Country string
	Region  *string
	Label   string
	Rate    int // basis points, 825 = 8.25%
}

type Result struct {
	Rate   int
	Amount money.Amount
	Label  *string
	Lines  []Line
}

type Line struct {
	Label  string
	Rate   int
	Amount money.Amount
}

var regionNames = map[string]string{
	"california": "CA",
	"new york":   "NY",
	"texas":      "TX",
	"florida":    "FL",
	"illinois":   "IL",
	"washington": "WA",
}

var countryNames = map[string]string{
	"united states":  "US",
	"canada":         "CA",
	"united kingdom": "GB",
	"germany":        "DE",
	"france":         "FR",
	"australia":      "AU",
	"japan":          "JP",
	"china":          "CN",
	"switzerland":    "CH",
	"netherlands":    "NL",
	"spain":          "ES",
	"italy":          "IT",
	"sweden":         "SE",
	"singapore":      "SG",
	"hong kong":      "HK",
	"south korea":    "KR",
	"new zealand":    "NZ",
}

// CountryCode normalises "United States", "us" and "US" to "US".
func CountryCode(input string) string {
	v := strings.TrimSpace(input)
	if v == "" {
		return "US"
	}
	if len(v) == 2 {
		return strings.ToUpper(v)
	}
	if code, ok := countryNames[strings.ToLower(v)]; ok {
		return code
	}
	return strings.ToUpper(v)
}

func normaliseRegion(region *string) *string {
	if region == nil {
		return nil
	}
	v := strings.TrimSpace(*region)
	if v == "" {
		return nil
	}
	if len(v) <= 3 {
		up := strings.ToUpper(v)
		return &up
	}
	if code, ok := regionNames[strings.ToLower(v)]; ok {
		return &code
	}
	up := strings.ToUpper(v)
	return &up
}

// ResolveRate picks the most specific matching tier and sums the rows within it,
// which is how GST+PST and state+county stacks work.
func ResolveRate(ctx context.Context, pool *db.Pool, country string, region *string) (int, *string) {
	rows, err := pool.Query(ctx, `SELECT country, region, label, rate FROM "TaxRate" WHERE active = true`)
	if err != nil {
		return 0, nil
	}
	defer rows.Close()

	uc := CountryCode(country)
	ur := normaliseRegion(region)

	var matched []Rate
	for rows.Next() {
		var r Rate
		if err := rows.Scan(&r.Country, &r.Region, &r.Label, &r.Rate); err != nil {
			continue
		}
		if r.Country != "*" && strings.ToUpper(r.Country) != uc {
			continue
		}
		if r.Region != nil {
			nr := normaliseRegion(r.Region)
			if ur == nil || nr == nil || *nr != *ur {
				continue
			}
		}
		matched = append(matched, r)
	}
	if len(matched) == 0 {
		return 0, nil
	}

	var withRegion []Rate
	for _, r := range matched {
		if r.Region != nil {
			withRegion = append(withRegion, r)
		}
	}
	chosen := matched
	if len(withRegion) > 0 {
		chosen = withRegion
	}

	total := 0
	labels := make([]string, 0, len(chosen))
	for _, r := range chosen {
		total += r.Rate
		labels = append(labels, r.Label)
	}
	label := strings.Join(labels, " + ")
	return total, &label
}

// Compute applies the resolved rate to a taxable base.
func Compute(taxableBase money.Amount, rateBasisPoints int, pricesIncludeTax bool) (money.Amount, int) {
	if rateBasisPoints <= 0 {
		return 0, 0
	}
	if pricesIncludeTax {
		// Extract the tax already baked into the price.
		divisor := 1 + float64(rateBasisPoints)/10000
		raw := float64(taxableBase) - float64(taxableBase)/divisor
		return money.Amount(int64(raw + 0.5)), rateBasisPoints
	}
	raw := float64(taxableBase) * float64(rateBasisPoints) / 10000
	return money.Amount(int64(raw + 0.5)), rateBasisPoints
}
