# vieo

A self-hosted video streaming platform that transcodes media sources into HLS for web playback.

vieo manages channels, sources, outputs, and encoding jobs through a SQLite database, with a React + shadcn/ui web interface. It uses ffmpeg/ffprobe for transcoding and probing, and hls.js for browser playback.

## Features

- **Channel management** — Organize streams into named channels
- **Source ingestion** — Support for files, URLs, HLS, RTMP, RTSP, and device inputs
- **HLS transcoding** — ffmpeg-based transcoding to adaptive HLS (`.m3u8` + `.ts` segments)
- **Live preview** — Watch streams in real-time as they are being transcoded
- **Job control** — Start, stop, pause, and retry transcoding jobs
- **Auto-detection** — Stream type (video+audio, video-only, audio-only) detected automatically from probe results
- **Disk monitoring** — Automatic job pausing when disk usage exceeds thresholds
- **WebSocket updates** — Real-time job status and progress via WebSocket
- **Dark mode** — Built-in light/dark theme toggle

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.25 |
| HTTP Router | [chi](https://github.com/go-chi/chi) |
| Database | SQLite via [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) (pure Go, no CGO) |
| WebSocket | [nhooyr.io/websocket](https://pkg.go.dev/nhooyr.io/websocket) |
| Media | ffmpeg (transcoding), ffprobe (probing) — CLI subprocess |
| Frontend | React 18, TypeScript, Vite 6 |
| UI | [shadcn/ui](https://ui.shadcn.com/) (Radix primitives + Tailwind CSS) |
| Player | [hls.js](https://github.com/video-dev/hls.js) |

## Prerequisites

- **Go 1.25+**
- **Node.js 18+** and npm
- **ffmpeg** and **ffprobe** installed and available in `$PATH`

```bash
# Debian/Ubuntu
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

## Quick Start

### 1. Clone and build

```bash
git clone <repo-url> vieo
cd vieo

# Build backend
go build -o vieo ./cmd/vieo

# Build frontend
cd web
npm install
npm run build
cd ..
```

### 2. Run

```bash
./vieo
```

The server starts on `http://localhost:8080` by default. Open this URL in your browser.

### 3. Development mode

In separate terminals:

```bash
# Backend (with hot reload if using air, or just)
go run ./cmd/vieo

# Frontend (Vite dev server on :5173, proxies /api to :8080)
cd web && npm run dev
```

## Configuration

Configuration is loaded in order: **flags → environment variables → defaults**.

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `-db` | `VIEO_DB_PATH` | `./vieo.db` | SQLite database file path |
| `-data-dir` | `VIEO_DATA_DIR` | `./data` | Output directory for HLS segments |
| `-http-addr` | `VIEO_HTTP_ADDR` | `:8080` | HTTP server listen address |
| `-log-level` | `VIEO_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `-disk-warn` | `VIEO_DISK_WARN` | `90` | Disk usage % to pause jobs |
| `-disk-crit` | `VIEO_DISK_CRIT` | `95` | Disk usage % to force-stop all jobs |
| `-max-jobs` | `VIEO_MAX_JOBS` | `3` | Maximum concurrent transcoding jobs |

Example:

```bash
VIEO_HTTP_ADDR=:9090 VIEO_MAX_JOBS=5 ./vieo
```

## Project Structure

```
vieo/
├── cmd/vieo/main.go              # Entrypoint — flags, config, run
├── internal/
│   ├── config/config.go          # Config loading (flags → env → file)
│   ├── db/
│   │   ├── db.go                 # SQLite pool, migrations
│   │   └── models/               # channel.go, source.go, output.go, job.go
│   ├── disk/disk.go              # Shared disk usage utility
│   ├── server/
│   │   ├── server.go             # HTTP server setup, middleware
│   │   ├── routes.go             # Route registration
│   │   └── handler/              # REST + WS handlers
│   ├── media/
│   │   ├── engine.go             # ffmpeg transcode → HLS pipeline
│   │   ├── probe.go              # ffprobe media info parsing
│   │   └── segmenter.go          # HLS segment + playlist utilities
│   └── job/
│       ├── manager.go            # Job state machine + lifecycle
│       └── watcher.go            # Disk space monitor
├── web/                          # React frontend
│   ├── src/
│   │   ├── pages/                # Dashboard, Channels, ChannelDetail,
│   │   │                         # Sources, Jobs, Player
│   │   ├── components/           # VideoPlayer, JobStatusBadge, ProgressBar, etc.
│   │   ├── lib/                  # API client (api.ts), utils
│   │   └── hooks/                # useWebSocket
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── go.mod / go.sum
├── AGENTS.md                     # AI agent development guide
├── README.md                     # This file
└── VIEO.md                       # Platform design document
```

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + disk stats |
| `GET` | `/api/channels` | List channels |
| `POST` | `/api/channels` | Create channel |
| `GET` | `/api/channels/{id}` | Get channel |
| `PUT` | `/api/channels/{id}` | Update channel |
| `DELETE` | `/api/channels/{id}` | Delete channel |
| `GET` | `/api/sources` | List sources (filter: `?channel_id=`) |
| `POST` | `/api/sources` | Create source |
| `GET` | `/api/sources/{id}` | Get source |
| `DELETE` | `/api/sources/{id}` | Delete source |
| `GET` | `/api/outputs` | List outputs |
| `POST` | `/api/outputs` | Create output |
| `DELETE` | `/api/outputs/{id}` | Delete output |
| `GET` | `/api/jobs` | List jobs (filter: `?status=`, `?source_id=`) |
| `POST` | `/api/jobs` | Create + start job |
| `POST` | `/api/jobs/{id}/stop` | Stop job |
| `POST` | `/api/jobs/{id}/pause` | Pause job |
| `POST` | `/api/jobs/{id}/retry` | Retry job |
| `DELETE` | `/api/jobs/{id}` | Delete job |
| `GET` | `/api/stream/{id}/*` | Serve HLS files (`.m3u8`, `.ts`) |

### WebSocket

Connect to `/api/ws` for real-time job events.

**Event types:**

```json
{"type": "job:update",   "payload": {"id": 1, "status": "running", "progress": 0.45}}
{"type": "job:log",      "payload": {"id": 1, "level": "info", "message": "..."}}
{"type": "job:complete", "payload": {"id": 1, "status": "completed"}}
{"type": "job:error",    "payload": {"id": 1, "status": "failed", "error": "..."}}
{"type": "job:paused",   "payload": {"id": 1, "status": "paused", "reason": "..."}}
```

## Job State Machine

```
         ┌──────────┐
         │  pending  │
         └────┬─────┘
              │ start
         ┌────▼─────┐
    ┌────│  running  │◄────────────┐
    │    └────┬─────┘              │
    │         │ fail / stop        │ retry
    │    ┌────▼─────┐         ┌────┴─────┐
    │    │  failed   │         │  paused   │
    │    └──────────┘         └────┬─────┘
    │                              │ resume
    │    ┌──────────┐              │
    └────│completed │              │
         └──────────┘              │
                                   │
                              ┌────▼─────┐
                              │ stopped   │
                              └──────────┘
```

## Usage Workflow

1. **Create a Channel** — Go to Channels → New Channel → enter name and description
2. **Add a Source** — Open a channel → Add Source → select type (File, HLS, RTMP, etc.) → enter URL
3. **Start Transcoding** — Click "Start Transcoding" on a source
4. **Monitor Progress** — Watch real-time progress on the Jobs page
5. **View Stream** — Click the play button on a running or completed job to open the player
6. **Manage Jobs** — Pause, stop, retry, or delete jobs from the Jobs page

## Disk Management

vieo monitors disk usage every 30 seconds:

- **Warning threshold** (default 90%) — Running transcoding jobs are paused
- **Critical threshold** (default 95%) — All jobs are force-stopped
- When disk usage drops below the warning threshold, paused jobs automatically resume

## Development

### Backend

```bash
go build ./cmd/vieo       # Build
go run ./cmd/vieo          # Run
go test ./...              # Run tests
go vet ./...               # Static analysis
```

### Frontend

```bash
cd web
npm install                # Install dependencies
npm run dev                # Dev server (port 5173)
npm run build              # Production build
npm run lint               # Lint
```

### Coding Conventions

**Go:**
- Imports: stdlib → third-party → internal (three groups)
- Error handling: always check, wrap with `fmt.Errorf("context: %w", err)`
- Naming: `camelCase` unexported, `PascalCase` exported, acronyms uppercase (HTTP, URL, ID)
- SQL: prepared statements via `database/sql`, migrations in `db.go`

**React:**
- Functional components with hooks, no classes
- TypeScript strict mode
- shadcn/ui components with `cn()` for class merging
- React Query for server state
- Custom `useWebSocket` hook for real-time updates

## License

See LICENSE file for details.
