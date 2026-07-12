package media

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	FilmstripInterval = 5
	FilmstripTileW    = 160
	FilmstripTileH    = 90
	FilmstripGridCols = 10
	FilmstripGridRows = 10
)

type FilmstripMeta struct {
	Interval      int              `json:"interval"`
	TileWidth     int              `json:"tileWidth"`
	TileHeight    int              `json:"tileHeight"`
	GridCols      int              `json:"gridCols"`
	GridRows      int              `json:"gridRows"`
	StartTime     string           `json:"startTime"`
	TotalDuration float64          `json:"totalDuration"`
	Tiles         []FilmstripTile  `json:"tiles"`
}

type FilmstripTile struct {
	File  string `json:"file"`
	Index int    `json:"index"`
	Count int    `json:"count"`
}

func FilmstripExists(outputDir string) bool {
	metaPath := filepath.Join(outputDir, "thumbs.json")
	info, err := os.Stat(metaPath)
	return err == nil && info.Size() > 0
}

func GenerateFilmstrip(ctx context.Context, outputDir string, jobCreatedAt time.Time, totalDuration float64) error {
	if FilmstripExists(outputDir) {
		return nil
	}

	segments, err := ListSegments(outputDir)
	if err != nil {
		return fmt.Errorf("list segments: %w", err)
	}
	if len(segments) == 0 {
		return fmt.Errorf("no segments in %s", outputDir)
	}

	type segInfo struct {
		name string
		num  int
	}
	var parsed []filmstripSeg
	for _, name := range segments {
		m := segRe.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		parsed = append(parsed, filmstripSeg{name: name, num: n})
	}
	if len(parsed) == 0 {
		return fmt.Errorf("no valid segments in %s", outputDir)
	}
	sort.Slice(parsed, func(i, j int) bool {
		return parsed[i].num < parsed[j].num
	})

	if totalDuration <= 0 {
		totalDuration = float64(len(parsed)) * 4.0
	}

	totalThumbs := int(math.Ceil(totalDuration / float64(FilmstripInterval)))
	if totalThumbs == 0 {
		return nil
	}

	tilesPerSheet := FilmstripGridCols * FilmstripGridRows
	totalSheets := int(math.Ceil(float64(totalThumbs) / float64(tilesPerSheet)))

	playlistPath := PlaylistPath(outputDir)

	var meta FilmstripMeta
	meta.Interval = FilmstripInterval
	meta.TileWidth = FilmstripTileW
	meta.TileHeight = FilmstripTileH
	meta.GridCols = FilmstripGridCols
	meta.GridRows = FilmstripGridRows
	meta.StartTime = jobCreatedAt.Format(time.RFC3339)
	meta.TotalDuration = totalDuration

	for sheetIdx := 0; sheetIdx < totalSheets; sheetIdx++ {
		spriteFile := fmt.Sprintf("sprite_%03d.jpg", sheetIdx)
		spritePath := filepath.Join(outputDir, spriteFile)

		startTimeSec := float64(sheetIdx * tilesPerSheet * FilmstripInterval)
		endTimeSec := float64((sheetIdx + 1) * tilesPerSheet * FilmstripInterval)
		if endTimeSec > totalDuration {
			endTimeSec = totalDuration
		}
		sheetDuration := endTimeSec - startTimeSec

		remainingThumbs := totalThumbs - sheetIdx*tilesPerSheet
		sheetTiles := remainingThumbs
		if sheetTiles > tilesPerSheet {
			sheetTiles = tilesPerSheet
		}

		args := []string{
			"-y",
			"-ss", fmt.Sprintf("%.1f", startTimeSec),
			"-t", fmt.Sprintf("%.1f", sheetDuration),
			"-i", playlistPath,
			"-vf", fmt.Sprintf(
				"fps=1/%d,scale=%d:%d,tile=%dx%d",
				FilmstripInterval, FilmstripTileW, FilmstripTileH,
				FilmstripGridCols, FilmstripGridRows,
			),
			"-frames:v", "1",
			"-q:v", "65",
			spritePath,
		}

		cmd := exec.CommandContext(ctx, "ffmpeg", args...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("filmstrip sheet %d: ffmpeg error: %v: %s", sheetIdx, err, strings.TrimSpace(string(out)))
			if altErr := generateFilmstripFromSegments(ctx, parsed, outputDir, sheetIdx, startTimeSec); altErr != nil {
				log.Printf("filmstrip sheet %d from segments fallback: %v", sheetIdx, altErr)
				continue
			}
		}

		meta.Tiles = append(meta.Tiles, FilmstripTile{
			File:  spriteFile,
			Index: sheetIdx,
			Count: sheetTiles,
		})
	}

	if err := writeFilmstripVTT(outputDir, &meta); err != nil {
		log.Printf("write filmstrip VTT: %v", err)
	}

	metaJSON, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal filmstrip meta: %w", err)
	}
	metaPath := filepath.Join(outputDir, "thumbs.json")
	tmpPath := metaPath + ".tmp"
	if err := os.WriteFile(tmpPath, metaJSON, 0644); err != nil {
		return fmt.Errorf("write filmstrip meta tmp: %w", err)
	}
	if err := os.Rename(tmpPath, metaPath); err != nil {
		return fmt.Errorf("rename filmstrip meta: %w", err)
	}

	log.Printf("filmstrip generated: %d sheets, %d thumbnails, %.0fs duration", len(meta.Tiles), totalThumbs, totalDuration)
	return nil
}

type filmstripSeg struct {
	name string
	num  int
}

func generateFilmstripFromSegments(ctx context.Context, parsed []filmstripSeg, outputDir string, sheetIdx int, startTimeSec float64) error {
	if len(parsed) == 0 {
		return fmt.Errorf("no segments")
	}

	tmpDir := filepath.Join(outputDir, fmt.Sprintf("filmstrip_tmp_%d", sheetIdx))
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		return fmt.Errorf("create tmp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	concatFile := filepath.Join(tmpDir, "concat.txt")
	var concatLines []string
	for _, s := range parsed {
		concatLines = append(concatLines, fmt.Sprintf("file '%s'", filepath.Join(outputDir, s.name)))
	}
	if err := os.WriteFile(concatFile, []byte(strings.Join(concatLines, "\n")), 0644); err != nil {
		return fmt.Errorf("write concat file: %w", err)
	}

	spriteFile := fmt.Sprintf("sprite_%03d.jpg", sheetIdx)
	spritePath := filepath.Join(outputDir, spriteFile)

	args := []string{
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", concatFile,
		"-ss", fmt.Sprintf("%.0f", startTimeSec),
		"-vf", fmt.Sprintf(
			"fps=1/%d,scale=%d:%d,tile=%dx%d",
			FilmstripInterval, FilmstripTileW, FilmstripTileH,
			FilmstripGridCols, FilmstripGridRows,
		),
		"-frames:v", "1",
		"-q:v", "65",
		spritePath,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("concat ffmpeg: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func writeFilmstripVTT(outputDir string, meta *FilmstripMeta) error {
	var lines []string
	lines = append(lines, "WEBVTT")
	lines = append(lines, "")

	for _, tile := range meta.Tiles {
		for i := 0; i < tile.Count; i++ {
			frameIdx := tile.Index*FilmstripGridCols*FilmstripGridRows + i
			startSec := float64(frameIdx * meta.Interval)
			endSec := startSec + float64(meta.Interval)
			if endSec > meta.TotalDuration {
				endSec = meta.TotalDuration
			}

			col := i % FilmstripGridCols
			row := i / FilmstripGridCols
			x := col * FilmstripTileW
			y := row * FilmstripTileH

			lines = append(lines, fmt.Sprintf("%s --> %s", formatVTTTime(startSec), formatVTTTime(endSec)))
			lines = append(lines, fmt.Sprintf("%s#xywh=%d,%d,%d,%d", tile.File, x, y, FilmstripTileW, FilmstripTileH))
			lines = append(lines, "")
		}
	}

	vttPath := filepath.Join(outputDir, "thumbs.vtt")
	data := []byte(strings.Join(lines, "\n") + "\n")
	tmpPath := vttPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("write VTT tmp: %w", err)
	}
	return os.Rename(tmpPath, vttPath)
}

func formatVTTTime(seconds float64) string {
	h := int(seconds / 3600)
	m := int(math.Mod(seconds/60, 60))
	s := int(math.Mod(seconds, 60))
	ms := int(math.Mod(seconds*1000, 1000))
	return fmt.Sprintf("%02d:%02d:%02d.%03d", h, m, s, ms)
}
