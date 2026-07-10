package media

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

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

func FinalizePlaylist(dir string) error {
	segments, err := ListSegments(dir)
	if err != nil {
		return fmt.Errorf("list segments: %w", err)
	}
	if len(segments) == 0 {
		return fmt.Errorf("no segments in %s", dir)
	}

	type seg struct {
		name string
		num  int
	}
	var parsed []seg
	for _, name := range segments {
		m := segRe.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		parsed = append(parsed, seg{name: name, num: n})
	}
	if len(parsed) == 0 {
		return fmt.Errorf("no valid segments in %s", dir)
	}

	sort.Slice(parsed, func(i, j int) bool {
		return parsed[i].num < parsed[j].num
	})

	var lines []string
	lines = append(lines, "#EXTM3U")
	lines = append(lines, "#EXT-X-VERSION:3")
	lines = append(lines, "#EXT-X-TARGETDURATION:4")
	lines = append(lines, fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d", parsed[0].num))

	for _, s := range parsed {
		lines = append(lines, "#EXTINF:4.000000,")
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

func RefreshLivePlaylist(dir string) error {
	segments, err := ListSegments(dir)
	if err != nil {
		return fmt.Errorf("list segments: %w", err)
	}
	if len(segments) == 0 {
		return nil
	}

	type seg struct {
		name string
		num  int
	}
	var parsed []seg
	for _, name := range segments {
		m := segRe.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		parsed = append(parsed, seg{name: name, num: n})
	}
	if len(parsed) == 0 {
		return nil
	}

	sort.Slice(parsed, func(i, j int) bool {
		return parsed[i].num < parsed[j].num
	})

	var lines []string
	lines = append(lines, "#EXTM3U")
	lines = append(lines, "#EXT-X-VERSION:3")
	lines = append(lines, "#EXT-X-TARGETDURATION:4")
	lines = append(lines, fmt.Sprintf("#EXT-X-MEDIA-SEQUENCE:%d", parsed[0].num))

	for _, s := range parsed {
		lines = append(lines, "#EXTINF:4.000000,")
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
