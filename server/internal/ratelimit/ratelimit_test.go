package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestFormatRetry(t *testing.T) {
	if got := FormatRetry(45); got != "45s" {
		t.Errorf("got %q", got)
	}
	if got := FormatRetry(90); got != "2 min" {
		t.Errorf("got %q", got)
	}
}

var _ = context.Background
var _ = time.Minute
