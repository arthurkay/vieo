package media

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
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
	Index      int    `json:"index"`
	CodecType  string `json:"codec_type"`
	CodecName  string `json:"codec_name"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	FrameRate  string `json:"frame_rate,omitempty"`
	SampleRate int    `json:"sample_rate,omitempty"`
	Channels   int    `json:"channels,omitempty"`
}

type DeviceInfo struct {
	InputFormat string `json:"input_format"`
	VideoSize   string `json:"video_size"`
	FrameRate   string `json:"frame_rate"`
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

	return parseFFProbeOutput(out)
}

func ProbeDevice(ctx context.Context, devicePath string) (*MediaInfo, *DeviceInfo, error) {
	info, devInfo, err := probeDeviceWithV4L2Ctl(devicePath)
	if err == nil {
		return info, devInfo, nil
	}

	info, devInfo, err = probeDeviceWithFFProbe(ctx, devicePath)
	if err == nil {
		return info, devInfo, nil
	}

	return probeDeviceDefault(devicePath)
}

func probeDeviceWithV4L2Ctl(devicePath string) (*MediaInfo, *DeviceInfo, error) {
	cmd := exec.Command("v4l2-ctl", "--device", devicePath, "--list-formats-ext")
	out, err := cmd.Output()
	if err != nil {
		return nil, nil, fmt.Errorf("v4l2-ctl: %w", err)
	}

	info, devInfo := parseV4L2Output(string(out), devicePath)
	return info, devInfo, nil
}

var v4l2FmtRe = regexp.MustCompile(`\[(\d+)\]: '(\w+)'`)
var v4l2SizeRe = regexp.MustCompile(`Size: Stepwise\s+\d+x\d+\s*-\s*(\d+)x(\d+)`)
var v4l2DiscRe = regexp.MustCompile(`Size: Discontinuous\s+(\d+)x(\d+)`)

func parseV4L2Output(output, devicePath string) (*MediaInfo, *DeviceInfo) {
	lines := strings.Split(output, "\n")

	type formatEntry struct {
		pixelFormat string
		maxW, maxH  int
	}

	var formats []formatEntry
	var currentFmt string

	for _, line := range lines {
		if m := v4l2FmtRe.FindStringSubmatch(line); m != nil {
			currentFmt = m[2]
			continue
		}

		if currentFmt == "" {
			continue
		}

		if m := v4l2SizeRe.FindStringSubmatch(line); m != nil {
			w, _ := strconv.Atoi(m[1])
			h, _ := strconv.Atoi(m[2])
			formats = append(formats, formatEntry{currentFmt, w, h})
		} else if m := v4l2DiscRe.FindStringSubmatch(line); m != nil {
			w, _ := strconv.Atoi(m[1])
			h, _ := strconv.Atoi(m[2])
			formats = append(formats, formatEntry{currentFmt, w, h})
		}
	}

	preferred := []string{"MJPG", "YUYV", "YUV420"}
	chosen := formatEntry{pixelFormat: "YUYV", maxW: 640, maxH: 480}

	for _, p := range preferred {
		for _, f := range formats {
			if f.pixelFormat == p && (f.maxW*f.maxH) > (chosen.maxW*chosen.maxH) {
				chosen = f
			}
		}
	}

	for _, f := range formats {
		if (f.maxW * f.maxH) > (chosen.maxW * chosen.maxH) {
			chosen = f
		}
	}

	frameRate := "30"

	devInfo := &DeviceInfo{
		InputFormat: strings.ToLower(chosen.pixelFormat),
		VideoSize:   fmt.Sprintf("%dx%d", chosen.maxW, chosen.maxH),
		FrameRate:   frameRate,
	}

	info := &MediaInfo{
		Format: FormatInfo{
			Filename:   devicePath,
			Duration:   0,
			FormatName: "video4linux2",
		},
		Streams: []StreamInfo{
			{
				Index:     0,
				CodecType: "video",
				CodecName: chosen.pixelFormat,
				Width:     chosen.maxW,
				Height:    chosen.maxH,
			},
		},
	}

	return info, devInfo
}

func probeDeviceWithFFProbe(ctx context.Context, devicePath string) (*MediaInfo, *DeviceInfo, error) {
	args := []string{
		"-v", "quiet",
		"-print_format", "json",
		"-show_streams",
		"-f", "v4l2",
		"-i", devicePath,
	}

	probeCtx, cancel := context.WithTimeout(ctx, 3000)
	defer cancel()

	cmd := exec.CommandContext(probeCtx, "ffprobe", args...)
	raw, err := cmd.CombinedOutput()
	if err != nil {
		return nil, nil, fmt.Errorf("ffprobe device: %w: %s", err, strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Streams []struct {
			Index     int    `json:"index"`
			CodecType string `json:"codec_type"`
			CodecName string `json:"codec_name"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
			FrameRate string `json:"r_frame_rate"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, nil, fmt.Errorf("parse ffprobe device: %w", err)
	}

	info := &MediaInfo{
		Format: FormatInfo{
			Filename:   devicePath,
			Duration:   0,
			FormatName: "video4linux2",
		},
	}

	devInfo := &DeviceInfo{}

	for _, s := range parsed.Streams {
		si := StreamInfo{
			Index:     s.Index,
			CodecType: s.CodecType,
			CodecName: s.CodecName,
			Width:     s.Width,
			Height:    s.Height,
		}
		if s.CodecType == "video" {
			si.FrameRate = parseFrameRate(s.FrameRate)
			devInfo.VideoSize = fmt.Sprintf("%dx%d", s.Width, s.Height)
			devInfo.InputFormat = s.CodecName
			devInfo.FrameRate = si.FrameRate
		}
		info.Streams = append(info.Streams, si)
	}

	return info, devInfo, nil
}

func probeDeviceDefault(devicePath string) (*MediaInfo, *DeviceInfo, error) {
	devInfo := &DeviceInfo{
		InputFormat: "yuyv422",
		VideoSize:   "640x480",
		FrameRate:   "30",
	}

	info := &MediaInfo{
		Format: FormatInfo{
			Filename:   devicePath,
			Duration:   0,
			FormatName: "video4linux2",
		},
		Streams: []StreamInfo{
			{
				Index:     0,
				CodecType: "video",
				CodecName: "yuyv422",
				Width:     640,
				Height:    480,
				FrameRate: "30",
			},
		},
	}

	return info, devInfo, nil
}

func parseFFProbeOutput(raw []byte) (*MediaInfo, error) {
	var rawData struct {
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

	if err := json.Unmarshal(raw, &rawData); err != nil {
		return nil, fmt.Errorf("parse ffprobe output: %w", err)
	}

	info := &MediaInfo{}
	info.Format.Filename = rawData.Format.Filename
	info.Format.Duration, _ = strconv.ParseFloat(rawData.Format.Duration, 64)
	info.Format.Size, _ = strconv.ParseInt(rawData.Format.Size, 10, 64)
	info.Format.Bitrate, _ = strconv.Atoi(rawData.Format.Bitrate)
	info.Format.FormatName = rawData.Format.FormatName

	for _, s := range rawData.Streams {
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
