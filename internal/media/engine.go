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

type TranscodeConfig struct {
	SourceType    string
	SourceURL     string
	OutputDir     string
	TotalDuration float64
	HasVideo      bool
	StartNumber   int
	InputFormat   string
	VideoSize     string
	FrameRate     string
}

func Transcode(ctx context.Context, cfg TranscodeConfig, onProgress ProgressFn) error {
	playlist := fmt.Sprintf("%s/ffmpeg.m3u8", cfg.OutputDir)
	segmentPattern := fmt.Sprintf("%s/seg_%%05d.ts", cfg.OutputDir)

	args := buildInputArgs(cfg)

	args = append(args, "-codec:a", "aac", "-b:a", "128k")
	if cfg.HasVideo {
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
	if cfg.StartNumber > 0 {
		args = append(args, "-start_number", strconv.Itoa(cfg.StartNumber))
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
				progress := parseProgressLine(line, cfg.TotalDuration)
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

func buildInputArgs(cfg TranscodeConfig) []string {
	var args []string

	switch cfg.SourceType {
	case "device":
		args = append(args, "-f", "v4l2")
		if cfg.InputFormat != "" {
			args = append(args, "-input_format", cfg.InputFormat)
		}
		if cfg.VideoSize != "" {
			args = append(args, "-video_size", cfg.VideoSize)
		}
		if cfg.FrameRate != "" {
			args = append(args, "-framerate", cfg.FrameRate)
		}
	case "hls":
		args = append(args, "-re", "-rw_timeout", "5000000")
	case "udp":
		args = append(args, "-fflags", "nobuffer+discardcorrupt")
	case "rtp":
		args = append(args, "-fflags", "nobuffer")
	}

	args = append(args, "-i", cfg.SourceURL)
	return args
}

func GenerateThumbnail(ctx context.Context, input, inputFormat, outputPath string) error {
	args := []string{
		"-y",
		"-analyzeduration", "5000000",
		"-probesize", "5000000",
	}
	if inputFormat != "" {
		args = append(args, "-f", inputFormat)
	}
	args = append(args,
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("generate thumbnail: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func GenerateThumbnailFromSegment(ctx context.Context, segmentPath, outputPath string) error {
	args := []string{
		"-y",
		"-i", segmentPath,
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	}
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("generate thumbnail from segment: %w: %s", err, strings.TrimSpace(string(out)))
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
