package media

import (
	"fmt"
	"os"
	"path/filepath"
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
