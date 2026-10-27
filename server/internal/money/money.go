package money

// Amounts are integer minor units (cents). Everything in the service uses this
// type to make "is this dollars or cents?" compile-time obvious.
type Amount int64

const (
	FreeShippingThreshold Amount = 15000
	ShippingFee           Amount = 1200
)

func (a Amount) Mul(n int) Amount    { return Amount(int64(a) * int64(n)) }
func (a Amount) Add(b Amount) Amount { return a + b }
func (a Amount) Sub(b Amount) Amount {
	if b > a {
		return 0
	}
	return a - b
}

// Convert applies an FX rate, rounding half away from zero like JS Math.round.
func (a Amount) Convert(rate float64) Amount {
	if rate == 1 {
		return a
	}
	return Amount(roundHalfUp(float64(a) * rate))
}

func roundHalfUp(v float64) int64 {
	if v < 0 {
		return -int64(-v + 0.5)
	}
	return int64(v + 0.5)
}

// Format renders an amount for a currency, matching the storefront's format.
//
// Amounts are always stored in minor units of the *base* currency (cents).
// A currency with fewer display decimals (JPY, KRW) still receives a converted
// amount in cents, so the value is scaled to whole units before formatting.
func Format(a Amount, symbol string, decimals int) string {
	value := float64(a) / 100
	return symbol + formatDecimal(value, decimals)
}

// FormatConverted formats a base-currency amount in a display currency.
//
// The stored amount is in base cents; `rate` turns it into display-currency
// cents, and zero-decimal currencies (JPY/KRW) then render whole units.
func FormatConverted(base Amount, rate float64, symbol string, decimals int) string {
	converted := base.Convert(rate)
	value := float64(converted) / 100 // display currency major units
	return symbol + formatDecimal(value, decimals)
}

func formatDecimal(v float64, decimals int) string {
	// Group thousands, then pad/trim decimals the way en-US does.
	neg := v < 0
	if neg {
		v = -v
	}
	pow := 1.0
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	scaled := int64(v*pow + 0.5)
	whole := scaled / int64(pow)
	frac := scaled % int64(pow)

	out := groupThousands(whole)
	if decimals > 0 {
		digits := padLeft(frac, decimals)
		out += "." + digits
	}
	if neg {
		return "-" + out
	}
	return out
}

func groupThousands(n int64) string {
	s := itoa(n)
	if len(s) <= 3 {
		return s
	}
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	if s != "" {
		parts = append([]string{s}, parts...)
	}
	out := parts[0]
	for _, p := range parts[1:] {
		out += "," + p
	}
	return out
}

func padLeft(n int64, width int) string {
	s := itoa(n)
	for len(s) < width {
		s = "0" + s
	}
	return s
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
