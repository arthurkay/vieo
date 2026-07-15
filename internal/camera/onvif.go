package camera

import (
	"context"
	"fmt"
	"strings"
	"time"

	onvif "github.com/0x524a/onvif-go"
	"github.com/0x524a/onvif-go/discovery"
)

// ONVIFCamera represents an IP camera discovered on the network via ONVIF
// WS-Discovery.
type ONVIFCamera struct {
	Endpoint     string `json:"endpoint"` // device service URL
	Name         string `json:"name"`     // ONVIF device name
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	Firmware     string `json:"firmware"`
	StreamURI    string `json:"stream_uri"`   // primary RTSP stream URL
	SnapshotURI  string `json:"snapshot_uri"` // JPEG snapshot URL (may be empty)
	Username     string `json:"username,omitempty"`
	// AuthRequired indicates the camera rejected unauthenticated requests and
	// credentials must be supplied before recording.
	AuthRequired bool `json:"auth_required"`
}

// DiscoverONVIFCameras sends ONVIF WS-Discovery probes on the local network and
// resolves each discovered device to its RTSP stream URI. Cameras that require
// authentication will have AuthRequired=true and an empty StreamURI unless
// credentials are provided.
func DiscoverONVIFCameras(ctx context.Context, timeout time.Duration, username, password string) ([]ONVIFCamera, error) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	devices, err := discovery.Discover(ctx, timeout)
	if err != nil {
		return nil, fmt.Errorf("onvif discovery: %w", err)
	}

	var cameras []ONVIFCamera
	for _, dev := range devices {
		endpoint := dev.GetDeviceEndpoint()
		if endpoint == "" {
			continue
		}

		cam := ONVIFCamera{
			Endpoint: endpoint,
			Name:     dev.GetName(),
		}

		opts := []onvif.ClientOption{onvif.WithTimeout(10 * time.Second)}
		if username != "" {
			opts = append(opts, onvif.WithCredentials(username, password))
			cam.Username = username
		}

		client, cerr := onvif.NewClient(endpoint, opts...)
		if cerr != nil {
			// Still report the discovered endpoint so the user can supply creds.
			cam.AuthRequired = true
			cameras = append(cameras, cam)
			continue
		}

		if info, ierr := client.GetDeviceInformation(ctx); ierr == nil {
			cam.Manufacturer = info.Manufacturer
			cam.Model = info.Model
			cam.Firmware = info.FirmwareVersion
		}

		profiles, perr := client.GetProfiles(ctx)
		if perr != nil || len(profiles) == 0 {
			cam.AuthRequired = username == ""
			cameras = append(cameras, cam)
			continue
		}

		if uri, uerr := client.GetStreamURI(ctx, profiles[0].Token); uerr == nil {
			cam.StreamURI = normalizeRTSPURI(uri.URI, username, password)
		}
		if suri, serr := client.GetSnapshotURI(ctx, profiles[0].Token); serr == nil {
			cam.SnapshotURI = suri.URI
		}

		cameras = append(cameras, cam)
	}

	return cameras, nil
}

// normalizeRTSPURI injects credentials into the RTSP URL when they are present
// and not already embedded, since ffmpeg reads credentials from the URL.
func normalizeRTSPURI(uri, username, password string) string {
	if uri == "" || username == "" {
		return uri
	}
	if strings.Contains(uri, "@") {
		return uri
	}
	if !strings.HasPrefix(uri, "rtsp://") && !strings.HasPrefix(uri, "rtsps://") {
		return uri
	}
	parts := strings.SplitN(uri, "://", 2)
	if len(parts) != 2 {
		return uri
	}
	return fmt.Sprintf("%s://%s:%s@%s", parts[0], username, password, parts[1])
}
