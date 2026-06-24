package disk

import "syscall"

func Usage(path string) (usagePercent, totalGB, freeGB float64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, 0, err
	}

	total := float64(stat.Blocks) * float64(stat.Bsize)
	free := float64(stat.Bavail) * float64(stat.Bsize)
	used := total - free

	if total == 0 {
		return 0, 0, 0, nil
	}

	return (used / total) * 100, total / (1 << 30), free / (1 << 30), nil
}
