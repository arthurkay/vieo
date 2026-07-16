package media

import (
	"os"
	"testing"
)

func TestParseM3U(t *testing.T) {
	data, err := os.ReadFile("/tmp/test_m3u.m3u")
	if err != nil {
		t.Skip("test m3u not found")
	}

	channels := ParseM3U(data)
	if len(channels) != 3 {
		t.Fatalf("expected 3 channels, got %d", len(channels))
	}

	c0 := channels[0]
	if c0.Name != "ACCDN" {
		t.Errorf("channel 0 name = %q, want ACCDN", c0.Name)
	}
	if c0.Resolution != "1080p" {
		t.Errorf("channel 0 resolution = %q, want 1080p", c0.Resolution)
	}
	if c0.TvgID != "ACCDigitalNetwork.us@SD" {
		t.Errorf("channel 0 tvg_id = %q", c0.TvgID)
	}
	if c0.GeoBlocked {
		t.Errorf("channel 0 should not be geo-blocked")
	}
	if c0.URL == "" {
		t.Errorf("channel 0 url is empty")
	}

	c1 := channels[1]
	if c1.Name != "BBC Earth" {
		t.Errorf("channel 1 name = %q, want BBC Earth", c1.Name)
	}
	if !c1.GeoBlocked {
		t.Errorf("channel 1 should be geo-blocked")
	}

	c2 := channels[2]
	if c2.Name != "NBA TV" {
		t.Errorf("channel 2 name = %q, want NBA TV", c2.Name)
	}
	if !c2.GeoBlocked {
		t.Errorf("channel 2 should be geo-blocked")
	}
}
