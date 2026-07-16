package media

import (
	"regexp"
	"strings"
)

// M3UChannel represents a single channel entry in a channel-list M3U file
// (e.g. an IPTV/FAST channel guide), distinct from an HLS segment playlist.
type M3UChannel struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	TvgID      string `json:"tvg_id"`
	Resolution string `json:"resolution"`
	GeoBlocked bool   `json:"geo_blocked"`
}

var (
	extinfRe     = regexp.MustCompile(`#EXTINF[-:][-0-9.]+\s*(.*)$`)
	tvgIDRe      = regexp.MustCompile(`tvg-id="([^"]*)"`)
	resolutionRe = regexp.MustCompile(`\((\d+p(?:\s*HD)?|[\dx]+)\)`)
	geoBlockedRe = regexp.MustCompile(`(?i)\[geo[- ]?blocked\]`)
)

// ParseM3U parses a channel-list M3U file (the kind with #EXTINF:-1 lines
// followed by a stream URL). It returns the list of detected channels.
func ParseM3U(data []byte) []M3UChannel {
	channels := []M3UChannel{}
	lines := strings.Split(string(data), "\n")

	var pending *M3UChannel
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#EXTM3U") {
			continue
		}

		if strings.HasPrefix(line, "#EXTINF") {
			m := extinfRe.FindStringSubmatch(line)
			attrs := ""
			if len(m) > 1 {
				attrs = m[1]
			}

			name := attrs
			if idx := strings.Index(attrs, ","); idx >= 0 {
				name = attrs[idx+1:]
			}
			name = strings.TrimSpace(name)

			ch := &M3UChannel{Name: name}

			if tm := tvgIDRe.FindStringSubmatch(line); len(tm) > 1 {
				ch.TvgID = tm[1]
			}
			if rm := resolutionRe.FindStringSubmatch(name); len(rm) > 1 {
				ch.Resolution = rm[1]
			}
			if geoBlockedRe.MatchString(name) {
				ch.GeoBlocked = true
				name = geoBlockedRe.ReplaceAllString(name, "")
			}

			// Strip trailing resolution / grouping info, e.g. " (1080p)".
			if i := strings.LastIndex(name, "("); i >= 0 {
				name = strings.TrimSpace(name[:i])
			}
			ch.Name = strings.TrimSpace(name)

			pending = ch
			continue
		}

		// Skip other directives; a bare URL terminates the current entry.
		if strings.HasPrefix(line, "#") {
			continue
		}

		if pending != nil {
			pending.URL = line
			channels = append(channels, *pending)
			pending = nil
		}
	}

	return channels
}
