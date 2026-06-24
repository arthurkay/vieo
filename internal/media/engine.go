package media

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

var progressRe = regexp.MustCompile(`time=(\d+):(\d+):(\d+)\.(\d+)`)

type ProgressFn func(progress float64, logLine string)

func Transcode(ctx context.Context, input, outputDir string, totalDuration float64, hasVideo bool, startNumber int, onProgress ProgressFn) error {
	playlist := fmt.Sprintf("%s/playlist.m3u8", outputDir)
	segmentPattern := fmt.Sprintf("%s/seg_%%05d.ts", outputDir)

	args := []string{
		"-i", input,
		"-codec:a", "aac", "-b:a", "128k",
	}
	if hasVideo {
		args = append(args, "-codec:v", "libx264", "-preset", "fast", "-crf", "23")
	} else {
		args = append(args, "-vn")
	}
	args = append(args,
		"-f", "hls",
		"-hls_time", "4",
		"-hls_list_size", "0",
		"-hls_segment_filename", segmentPattern,
		"-progress", "pipe:1",
		"-loglevel", "warning",
	)
	if startNumber > 0 {
		args = append(args, "-start_number", strconv.Itoa(startNumber))
	}
	args = append(args, playlist)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start ffmpeg: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if onProgress != nil {
				progress := parseProgressLine(line, totalDuration)
				if progress >= 0 {
					onProgress(progress, line)
				}
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if onProgress != nil && !strings.HasPrefix(line, "frame=") {
				onProgress(-1, line)
			}
		}
	}()

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("ffmpeg exited: %w", err)
	}

	return nil
}

func GenerateThumbnail(ctx context.Context, input, outputPath string) error {
	args := []string{
		"-y",
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	}
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("generate thumbnail: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func parseProgressLine(line string, totalDuration float64) float64 {
	matches := progressRe.FindStringSubmatch(line)
	if matches == nil || totalDuration <= 0 {
		return -1
	}

	hours, _ := strconv.ParseFloat(matches[1], 64)
	minutes, _ := strconv.ParseFloat(matches[2], 64)
	seconds, _ := strconv.ParseFloat(matches[3], 64)
	centis, _ := strconv.ParseFloat(matches[4], 64)

	currentTime := hours*3600 + minutes*60 + seconds + centis/100
	progress := currentTime / totalDuration
	if progress > 1.0 {
		progress = 1.0
	}
	return progress
}
