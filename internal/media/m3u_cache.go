package media

import (
	"os"
	"sync"
	"time"
)

// M3UCache caches the parsed channel list from an M3U file on disk. It
// re-parses the file when the TTL elapses or when the file's modification
// time changes, so edits to the playlist become visible without a restart.
type M3UCache struct {
	mu       sync.RWMutex
	filePath string
	ttl      time.Duration

	channels []M3UChannel
	modTime  time.Time
	parsedAt time.Time
}

// NewM3UCache creates a cache for the given M3U file path with the given TTL.
func NewM3UCache(filePath string, ttl time.Duration) *M3UCache {
	return &M3UCache{filePath: filePath, ttl: ttl}
}

// Get returns the cached channels, re-parsing the file if it has changed or
// the cache has expired.
func (c *M3UCache) Get() ([]M3UChannel, error) {
	c.mu.RLock()
	fresh := time.Since(c.parsedAt) < c.ttl && !c.modTime.IsZero()
	if fresh {
		info, err := os.Stat(c.filePath)
		if err == nil && info.ModTime().Equal(c.modTime) {
			channels := c.channels
			c.mu.RUnlock()
			return channels, nil
		}
	}
	c.mu.RUnlock()

	return c.reload()
}

// reload re-reads and re-parses the file under a write lock.
func (c *M3UCache) reload() ([]M3UChannel, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Another caller may have refreshed while we waited for the lock.
	if time.Since(c.parsedAt) < c.ttl && !c.modTime.IsZero() {
		if info, err := os.Stat(c.filePath); err == nil && info.ModTime().Equal(c.modTime) {
			return c.channels, nil
		}
	}

	data, err := os.ReadFile(c.filePath)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(c.filePath)
	if err != nil {
		return nil, err
	}

	channels := ParseM3U(data)
	c.channels = channels
	c.modTime = info.ModTime()
	c.parsedAt = time.Now()
	return channels, nil
}

// Invalidate forces a re-parse on the next Get.
func (c *M3UCache) Invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.parsedAt = time.Time{}
}
