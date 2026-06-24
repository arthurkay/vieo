package media

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type MediaInfo struct {
	Format   FormatInfo   `json:"format"`
	Streams  []StreamInfo `json:"streams"`
}

type FormatInfo struct {
	Filename   string  `json:"filename"`
	Duration   float64 `json:"duration"`
	Size       int64   `json:"size"`
	Bitrate    int     `json:"bitrate"`
	FormatName string  `json:"format_name"`
}

type StreamInfo struct {
	Index     int    `json:"index"`
	CodecType string `json:"codec_type"`
	CodecName string `json:"codec_name"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	FrameRate string `json:"frame_rate,omitempty"`
	SampleRate int   `json:"sample_rate,omitempty"`
	Channels  int    `json:"channels,omitempty"`
}

func Probe(ctx context.Context, path string) (*MediaInfo, error) {
	args := []string{
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		path,
	}

	cmd := exec.CommandContext(ctx, "ffprobe", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("ffprobe: %w: %s", err, strings.TrimSpace(string(out)))
	}

	var raw struct {
		Format struct {
			Filename   string `json:"filename"`
			Duration   string `json:"duration"`
			Size       string `json:"size"`
			Bitrate    string `json:"bit_rate"`
			FormatName string `json:"format_name"`
		} `json:"format"`
		Streams []struct {
			Index      int    `json:"index"`
			CodecType  string `json:"codec_type"`
			CodecName  string `json:"codec_name"`
			Width      int    `json:"width"`
			Height     int    `json:"height"`
			FrameRate  string `json:"r_frame_rate"`
			SampleRate string `json:"sample_rate"`
			Channels   int    `json:"channels"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("parse ffprobe output: %w", err)
	}

	info := &MediaInfo{}
	info.Format.Filename = raw.Format.Filename
	info.Format.Duration, _ = strconv.ParseFloat(raw.Format.Duration, 64)
	info.Format.Size, _ = strconv.ParseInt(raw.Format.Size, 10, 64)
	info.Format.Bitrate, _ = strconv.Atoi(raw.Format.Bitrate)
	info.Format.FormatName = raw.Format.FormatName

	for _, s := range raw.Streams {
		si := StreamInfo{
			Index:     s.Index,
			CodecType: s.CodecType,
			CodecName: s.CodecName,
			Width:     s.Width,
			Height:    s.Height,
		}

		switch s.CodecType {
		case "audio":
			si.SampleRate, _ = strconv.Atoi(s.SampleRate)
			si.Channels = s.Channels
		case "video":
			si.FrameRate = parseFrameRate(s.FrameRate)
		}

		info.Streams = append(info.Streams, si)
	}

	return info, nil
}

func (m *MediaInfo) HasVideo() bool {
	for _, s := range m.Streams {
		if s.CodecType == "video" {
			return true
		}
	}
	return false
}

func (m *MediaInfo) HasAudio() bool {
	for _, s := range m.Streams {
		if s.CodecType == "audio" {
			return true
		}
	}
	return false
}

func parseFrameRate(r string) string {
	parts := strings.Split(r, "/")
	if len(parts) != 2 {
		return r
	}
	num, err1 := strconv.ParseFloat(parts[0], 64)
	den, err2 := strconv.ParseFloat(parts[1], 64)
	if err1 != nil || err2 != nil || den == 0 {
		return r
	}
	return fmt.Sprintf("%.2f", num/den)
}
