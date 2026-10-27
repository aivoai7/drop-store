package tax

import (
	"testing"

	"github.com/aivoai7/drop-store/server/internal/money"
)

func TestCountryCode(t *testing.T) {
	cases := map[string]string{
		"United States": "US",
		"us":            "US",
		"Germany":       "DE",
		"de":            "DE",
		"Switzerland":   "CH",
		"":              "US",
	}
	for in, want := range cases {
		if got := CountryCode(in); got != want {
			t.Errorf("CountryCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCompute(t *testing.T) {
	// 8.25% of $168.00 = $13.86
	got, _ := Compute(16800, 825, false)
	if got != 1386 {
		t.Errorf("tax on 16800 @8.25%% = %d, want 1386", got)
	}
	// Tax-inclusive: price already contains 20% VAT.
	got, _ = Compute(12000, 2000, true)
	if got != 2000 {
		t.Errorf("inclusive tax on 12000 @20%% = %d, want 2000", got)
	}
}

var _ = money.Amount(0)
