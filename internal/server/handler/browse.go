package handler

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/arthur/vieo/internal/media"
)

// ListBrowseChannels returns the parsed channel list from the M3U cache.
func ListBrowseChannels(cache *media.M3UCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cache == nil {
			writeJSONError(w, http.StatusNotFound, "no playlist configured")
			return
		}

		channels, err := cache.Get()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, map[string]interface{}{
			"channels": channels,
			"count":    len(channels),
		})
	}
}

// ProxyStream fetches an external HLS resource (playlist or segment) server-side
// and streams it back to the client. For playlists, URLs are rewritten so that
// all fragments are also fetched through this proxy (avoids CORS issues).
func ProxyStream() http.HandlerFunc {
	client := &http.Client{Timeout: 30 * time.Second}

	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.URL.Query().Get("url")
		if raw == "" {
			http.Error(w, "missing url parameter", http.StatusBadRequest)
			return
		}

		target, err := url.Parse(raw)
		if err != nil || (target.Scheme != "http" && target.Scheme != "https") {
			http.Error(w, "invalid url", http.StatusBadRequest)
			return
		}
		if isPrivateIP(target.Hostname()) {
			http.Error(w, "url not allowed", http.StatusForbidden)
			return
		}

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
		if err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		// Forward the browser's identity headers so origin CDNs that gate on
		// Referer/User-Agent/Cookie (hotlink protection) treat the proxy like
		// the original client. CloudFront signed-cookie flows still won't work
		// cross-domain, but this unblocks the common cases.
		forwardHeaders(req.Header, r.Header)

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Pass through upstream Set-Cookie so signed-cookie CDNs at least set
		// the cookie on the browser (helps direct/cookie-bearing playback).
		if cookies := resp.Header.Values("Set-Cookie"); len(cookies) > 0 {
			for _, c := range cookies {
				w.Header().Add("Set-Cookie", c)
			}
		}

		if resp.StatusCode != http.StatusOK {
			http.Error(w, "upstream returned "+resp.Status, resp.StatusCode)
			return
		}

		contentType := resp.Header.Get("Content-Type")

		if isPlaylist(contentType, target.Path) {
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				http.Error(w, "read error", http.StatusInternalServerError)
				return
			}
			rewritten := rewritePlaylist(string(body), target)
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Cache-Control", "no-cache")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(rewritten))
			return
		}

		// Stream media (e.g. .ts segments) through unchanged.
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=5")
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, resp.Body)
	}
}

// forwardHeaders copies a safe subset of the client's request headers onto the
// upstream request so origin CDNs see a browser-like client.
func forwardHeaders(dst, src http.Header) {
	for _, name := range []string{"User-Agent", "Referer", "Origin", "Cookie", "Accept", "Accept-Language", "Range"} {
		if v := src.Get(name); v != "" {
			dst.Set(name, v)
		}
	}
}

// isPlaylist reports whether the response is an HLS playlist.
func isPlaylist(contentType, path string) bool {
	if strings.Contains(contentType, "mpegurl") || strings.Contains(contentType, "vnd.apple.mpegurl") || strings.Contains(contentType, "x-mpegurl") {
		return true
	}
	return strings.HasSuffix(strings.ToLower(path), ".m3u8") || strings.HasSuffix(strings.ToLower(path), ".m3u")
}

// rewritePlaylist rewrites every URL in the playlist to point back through the
// proxy. Relative URLs are first resolved against the playlist's own base URL.
func rewritePlaylist(body string, base *url.URL) string {
	proxyPrefix := "/api/browse/stream?url="
	lines := strings.Split(body, "\n")
	out := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			out = append(out, line)
			continue
		}

		resolved := trimmed
		if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
			if u, err := base.Parse(trimmed); err == nil {
				resolved = u.String()
			}
		}

		out = append(out, proxyPrefix+url.QueryEscape(resolved))
	}

	return strings.Join(out, "\n")
}

// isPrivateIP rejects localhost and RFC1918/loopback/link-local hosts to avoid
// the proxy being used as an SSRF vector.
func isPrivateIP(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	if h == "localhost" || h == "0.0.0.0" || h == "::1" || h == "ip6-localhost" {
		return true
	}
	for _, prefix := range []string{"127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31.", "169.254."} {
		if strings.HasPrefix(h, prefix) {
			return true
		}
	}
	return false
}
