package media

import (
	"bufio"
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
	playlist := PlaylistPath(dir)
	f, err := os.OpenFile(playlist, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return fmt.Errorf("open playlist: %w", err)
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	for _, l := range lines {
		if strings.TrimSpace(l) == "#EXT-X-ENDLIST" {
			return nil
		}
	}

	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			lines = lines[:i]
		} else {
			lines = lines[:i]
			break
		}
	}

	for len(lines) > 0 {
		last := strings.TrimSpace(lines[len(lines)-1])
		m := segRe.FindStringSubmatch(last)
		if m == nil {
			lines = lines[:len(lines)-1]
			continue
		}
		segPath := filepath.Join(dir, last)
		info, err := os.Stat(segPath)
		if err != nil || info.Size() < 4096 {
			lines = lines[:len(lines)-1]
			continue
		}
		break
	}

	if len(lines) == 0 {
		return fmt.Errorf("empty playlist in %s", dir)
	}

	lines = append(lines, "#EXT-X-ENDLIST")
	data := []byte(strings.Join(lines, "\n") + "\n")
	if err := f.Truncate(0); err != nil {
		return fmt.Errorf("truncate playlist: %w", err)
	}
	if _, err := f.Seek(0, 0); err != nil {
		return fmt.Errorf("seek playlist: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write playlist: %w", err)
	}

	return nil
}

func PrepareResume(dir string) (int, error) {
	playlist := PlaylistPath(dir)

	f, err := os.Open(playlist)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("open playlist: %w", err)
	}

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	f.Close()

	var cleaned []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "#EXT-X-ENDLIST" || trimmed == "#EXT-X-MEDIA-SEQUENCE:0" {
			continue
		}
		cleaned = append(cleaned, l)
	}

	f2, err := os.Create(playlist)
	if err != nil {
		return 0, fmt.Errorf("create playlist: %w", err)
	}
	defer f2.Close()

	for _, l := range cleaned {
		fmt.Fprintln(f2, l)
	}

	entries, err := os.ReadDir(dir)
	if err == nil {
		var segNames []string
		for _, e := range entries {
			if !e.IsDir() && filepath.Ext(e.Name()) == ".ts" {
				segNames = append(segNames, e.Name())
			}
		}
		sort.Strings(segNames)

		if len(segNames) > 1 {
			for _, name := range segNames[:len(segNames)-1] {
				os.Remove(filepath.Join(dir, name))
			}
		}
	}

	maxSeg, err := LastSegmentNumber(dir)
	if err != nil {
		return 0, err
	}

	return maxSeg + 1, nil
}
