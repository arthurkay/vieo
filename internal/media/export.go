package media

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

type ExportConfig struct {
	PlaylistPath string
	StartTime    float64
	Duration     float64
	OutputPath   string
	HasVideo     bool
}

type ExportProgressFn func(progress float64, logLine string)

func ExportClip(ctx context.Context, cfg ExportConfig, onProgress ExportProgressFn) error {
	args := []string{
		"-y",
	}

	if cfg.StartTime > 0 {
		args = append(args, "-ss", fmt.Sprintf("%.3f", cfg.StartTime))
	}
	if cfg.Duration > 0 {
		args = append(args, "-t", fmt.Sprintf("%.3f", cfg.Duration))
	}

	args = append(args, "-i", cfg.PlaylistPath)

	args = append(args, "-codec:a", "aac", "-b:a", "128k")
	if cfg.HasVideo {
		args = append(args, "-codec:v", "libx264", "-preset", "fast", "-crf", "23")
	} else {
		args = append(args, "-vn")
	}

	args = append(args,
		"-movflags", "+faststart",
		"-progress", "pipe:1",
		"-loglevel", "warning",
	)
	args = append(args, cfg.OutputPath)

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
		return fmt.Errorf("start ffmpeg export: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if onProgress != nil {
				progress := parseProgressLine(line, cfg.Duration)
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
		return fmt.Errorf("ffmpeg export exited: %w", err)
	}

	return nil
}
