package money

import "testing"

func TestFormatConverted(t *testing.T) {
	cases := []struct {
		amount   Amount
		rate     float64
		symbol   string
		decimals int
		want     string
	}{
		{16800, 1, "$", 2, "$168.00"},
		{16800, 0.92, "€", 2, "€154.56"},
		{16800, 151.4, "¥", 0, "¥25,435"},
		{1234567, 1, "$", 2, "$12,345.67"},
		{5, 1, "$", 2, "$0.05"},
		{0, 1, "¥", 0, "¥0"},
	}
	for _, c := range cases {
		if got := FormatConverted(c.amount, c.rate, c.symbol, c.decimals); got != c.want {
			t.Errorf("FormatConverted(%d,%v) = %q, want %q", c.amount, c.rate, got, c.want)
		}
	}
}

func TestConvert(t *testing.T) {
	if got := Amount(16800).Convert(0.92); got != 15456 {
		t.Errorf("16800 * 0.92 = %d, want 15456", got)
	}
	if got := Amount(16800).Convert(151.4); got != 2543520 {
		t.Errorf("jpy conversion = %d, want 2543520", got)
	}
}
