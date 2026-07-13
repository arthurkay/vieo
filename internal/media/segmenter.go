package media

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var playlistMu sync.Map

func PlaylistDuration(dir string) float64 {
	playlistPath := filepath.Join(dir, "playlist.m3u8")
	data, err := os.ReadFile(playlistPath)
	if err != nil {
		return 0
	}
	var total float64
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "#EXTINF:") {
			continue
		}
		val := strings.TrimPrefix(line, "#EXTINF:")
		if idx := strings.Index(val, ","); idx >= 0 {
			val = val[:idx]
		}
		dur, err := strconv.ParseFloat(strings.TrimSpace(val), 64)
		if err == nil {
			total += dur
		}
	}
	return total
}

// segmentDurationCache caches ffprobe results keyed by "path|modtime|size".
var segmentDurationCache sync.Map

func EnsureOutputDir(dir string) error {
	return os.MkdirAll(dir, 0755)
}

func OutputDir(dataDir string, outputID int64) string {
	return filepath.Join(dataDir, fmt.Sprintf("output_%d", outputID))
}

func PlaylistPath(outputDir string) string {
	return filepath.Join(outputDir, "playlist.m3u8")
}

func ThumbnailPath(outputDir string) string {
	return filepath.Join(outputDir, "thumb.jpg")
}

func SegmentPath(outputDir, segmentName string) string {
	return filepath.Join(outputDir, segmentName)
}

func ThumbExists(outputDir string) bool {
	path := ThumbnailPath(outputDir)
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}

func SegmentExists(outputDir string, segmentName string) bool {
	path := filepath.Join(outputDir, segmentName)
	_, err := os.Stat(path)
	return err == nil
}

func ListSegments(outputDir string) ([]string, error) {
	entries, err := os.ReadDir(outputDir)
	if err != nil {
		return nil, fmt.Errorf("read output dir: %w", err)
	}

	var segments []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".ts" {
			segments = append(segments, e.Name())
		}
	}
	return segments, nil
}

func DirSize(dir string) (int64, error) {
	var size int64
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("read dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		size += info.Size()
	}
	return size, nil
}

func CleanOutputDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read output dir: %w", err)
	}

	for _, e := range entries {
		path := filepath.Join(dir, e.Name())
		if err := os.Remove(path); err != nil {
			return fmt.Errorf("remove %s: %w", path, err)
		}
	}
	return nil
}

var segRe = regexp.MustCompile(`seg_(\d+)\.ts`)

func getPlaylistMu(dir string) *sync.Mutex {
	val, _ := playlistMu.LoadOrStore(dir, &sync.Mutex{})
	return val.(*sync.Mutex)
}

func LastSegmentNumber(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, fmt.Errorf("read output dir: %w", err)
	}

	var max int
	found := false
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".ts" {
			continue
		}
		m := segRe.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		if n > max {
			max = n
			found = true
		}
	}
	if !found {
		return 0, nil
	}
	return max, nil
}

func FinalizePlaylist(ctx context.Context, dir string) error {
	mu := getPlaylistMu(dir)
	mu.Lock()
	defer mu.Unlock()

	segments, err := ListSegments(dir)
	if err != nil {
		return fmt.Errorf("list segments: %w", err)
	}
	if len(segments) == 0 {
		return fmt.Errorf("no segments in %s", dir)
	}

	type seg struct {
		name     string
		num      int
		duration float64
		startPTS float64
	}
	var parsed []seg
	for _, name := range segments {
		m := segRe.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		dur, _ := ProbeSegmentDuration(ctx, filepath.Join(dir, name))
		if dur <= 0 {
			dur = 4.0
		}
		pts, _ := ProbeSegmentStartPTS(ctx, filepath.Join(dir, name))
		parsed = append(parsed, seg{name: name, num: n, duration: dur, startPTS: pts})
	}
	if len(parsed) == 0 {
		return fmt.Errorf("no valid segments in %s", dir)
	}

	sort.Slice(parsed, func(i, j int) bool {
		return parsed[i].num < parsed[j].num
	})

	var maxDur float64
	for _, s := range parsed {
		if s.duration > maxDur {
			maxDur = s.duration
		}
	}
	targetDuration := int(math.Ceil(maxDur))
	if targetDuration < 1 {
		targetDuration = 4
	}

	var lines []string
	lines = append(lines, "#EXTM3U")
	lines = append(lines, "#EXT-X-VERSION:3")
	lines = append(lines, fmt.Sprintf("#EXT-X-TARGETDURATION:%d", targetDuration))
	lines = append(lines, fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d", parsed[0].num))

	for i, s := range parsed {
		if i > 0 {
			prev := parsed[i-1]
			expectedPTS := prev.startPTS + prev.duration
			if s.startPTS > 0 && expectedPTS > 0 {
				ptsGap := s.startPTS - expectedPTS
				if ptsGap > 2.0 || ptsGap < -2.0 {
					lines = append(lines, "#EXT-X-DISCONTINUITY")
				}
			}
		}
		lines = append(lines, fmt.Sprintf("#EXTINF:%.6f,", s.duration))
		lines = append(lines, s.name)
	}

	lines = append(lines, "#EXT-X-ENDLIST")

	playlist := PlaylistPath(dir)
	data := []byte(strings.Join(lines, "\n") + "\n")
	tmp := playlist + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write playlist tmp: %w", err)
	}
	if err := os.Rename(tmp, playlist); err != nil {
		return fmt.Errorf("rename playlist: %w", err)
	}

	return nil
}

func PrepareResume(dir string) (int, error) {
	maxSeg, err := LastSegmentNumber(dir)
	if err != nil {
		return 0, err
	}
	return maxSeg + 1, nil
}

func RefreshLivePlaylist(ctx context.Context, dir string) error {
	mu := getPlaylistMu(dir)
	mu.Lock()
	defer mu.Unlock()

	segments, err := ListSegments(dir)
	if err != nil {
		return fmt.Errorf("list segments: %w", err)
	}
	if len(segments) == 0 {
		return nil
	}

	now := time.Now()
	minAge := 3 * time.Second

	type seg struct {
		name     string
		num      int
		duration float64
	}
	var parsed []seg
	for _, name := range segments {
		m := segRe.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])

		segPath := filepath.Join(dir, name)
		info, statErr := os.Stat(segPath)
		if statErr != nil {
			continue
		}
		if info.Size() < 10240 {
			continue
		}
		if now.Sub(info.ModTime()) < minAge {
			continue
		}

		cacheKey := fmt.Sprintf("%s|%d|%d", segPath, info.ModTime().UnixNano(), info.Size())
		if cached, ok := segmentDurationCache.Load(cacheKey); ok {
			parsed = append(parsed, cached.(seg))
			continue
		}

		dur, _ := ProbeSegmentDuration(ctx, segPath)
		if dur <= 0 {
			dur = 4.0
		}
		cachedSeg := seg{name: name, num: n, duration: dur}
		segmentDurationCache.Store(cacheKey, cachedSeg)
		parsed = append(parsed, cachedSeg)
	}
	if len(parsed) == 0 {
		return nil
	}

	sort.Slice(parsed, func(i, j int) bool {
		return parsed[i].num < parsed[j].num
	})

	// Cap at ~24h of segments to prevent unbounded playlist growth
	const maxPlaylistSegments = 2160
	if len(parsed) > maxPlaylistSegments {
		parsed = parsed[len(parsed)-maxPlaylistSegments:]
	}

	var maxDur float64
	for _, s := range parsed {
		if s.duration > maxDur {
			maxDur = s.duration
		}
	}
	targetDuration := int(math.Ceil(maxDur))
	if targetDuration < 1 {
		targetDuration = 4
	}

	var lines []string
	lines = append(lines, "#EXTM3U")
	lines = append(lines, "#EXT-X-VERSION:3")
	lines = append(lines, fmt.Sprintf("#EXT-X-TARGETDURATION:%d", targetDuration))
	lines = append(lines, fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d", parsed[0].num))

	for _, s := range parsed {
		lines = append(lines, fmt.Sprintf("#EXTINF:%.6f,", s.duration))
		lines = append(lines, s.name)
	}

	playlist := PlaylistPath(dir)
	data := []byte(strings.Join(lines, "\n") + "\n")
	tmp := playlist + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write live playlist tmp: %w", err)
	}
	if err := os.Rename(tmp, playlist); err != nil {
		return fmt.Errorf("rename live playlist: %w", err)
	}

	return nil
}
