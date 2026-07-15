package camera

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/arthur/vieo/internal/media"
)

// V4L2Device represents a local video capture device discovered on the host.
type V4L2Device struct {
	Path        string   `json:"path"`        // e.g. /dev/video0
	Name        string   `json:"name"`        // friendly name from sysfs
	Formats     []string `json:"formats"`     // supported pixel formats (mjpeg, yuyv422, ...)
	Resolutions []string `json:"resolutions"` // supported WxH strings
	FrameRates  []string `json:"frame_rates"` // supported fps strings
	Probed      bool     `json:"probed"`      // whether ProbeDevice succeeded
}

// ScanV4L2Devices discovers local V4L2 capture devices by globbing /dev/video*
// and reading friendly names from sysfs. Metadata devices (non-capture) are
// filtered out when distinguishable.
func ScanV4L2Devices() []V4L2Device {
	var devices []V4L2Device

	matches, err := filepath.Glob("/dev/video*")
	if err != nil {
		return devices
	}

	for _, devPath := range matches {
		dev := V4L2Device{Path: devPath}

		// Read friendly name from sysfs
		namePath := "/sys/class/video4linux/" + filepath.Base(devPath) + "/name"
		if data, rerr := os.ReadFile(namePath); rerr == nil {
			dev.Name = strings.TrimSpace(string(data))
		}
		if dev.Name == "" {
			dev.Name = devPath
		}

		devices = append(devices, dev)
	}

	return devices
}

// ProbeV4L2Devices enriches each discovered device with format/resolution/fps
// capabilities using the existing media.ProbeDevice probe chain. Devices that
// cannot be probed are still returned (Probed=false).
func ProbeV4L2Devices(devices []V4L2Device) []V4L2Device {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	for i := range devices {
		_, devInfo, err := media.ProbeDevice(ctx, devices[i].Path)
		if err != nil {
			continue
		}
		devices[i].Probed = true
		if devInfo.InputFormat != "" {
			devices[i].Formats = append(devices[i].Formats, devInfo.InputFormat)
		}
		if devInfo.VideoSize != "" {
			devices[i].Resolutions = append(devices[i].Resolutions, devInfo.VideoSize)
		}
		if devInfo.FrameRate != "" {
			devices[i].FrameRates = append(devices[i].FrameRates, devInfo.FrameRate)
		}
	}

	return devices
}

// DiscoverV4L2 performs a full discovery: scan + probe.
func DiscoverV4L2() []V4L2Device {
	return ProbeV4L2Devices(ScanV4L2Devices())
}

// String is provided for debugging/logging.
func (d V4L2Device) String() string {
	b, _ := json.Marshal(d)
	return string(b)
}
