# vieo

A self-hosted video streaming platform that transcodes media sources into HLS for web playback.

vieo manages channels, sources, outputs, and encoding jobs through a SQLite database, with a React + shadcn/ui web interface. It uses ffmpeg/ffprobe for transcoding and probing, and hls.js for browser playback.

## Features

- **Channel management** — Organize streams into named channels
- **Source ingestion** — Support for files, URLs, HLS, RTMP, RTSP, UDP, RTP, SRT, and device inputs
- **HLS transcoding** — ffmpeg-based transcoding to adaptive HLS (`.m3u8` + `.ts` segments)
- **Live preview** — Watch streams in real-time as they are being transcoded
- **Job control** — Start, stop, pause, and resume transcoding jobs
- **Auto-detection** — Stream type (video+audio, video-only, audio-only) detected automatically from probe results
- **Disk monitoring** — Automatic job pausing when disk usage exceeds thresholds
- **WebSocket updates** — Real-time job status and progress via WebSocket with 30s heartbeat
- **Dark mode** — Built-in light/dark theme toggle
- **Filmstrip thumbnails** — Sprite sheet generation for visual timeline scrubbing in the player
- **Timeline events** — Create markers at specific points in recordings
- **Video export** — Clip extraction from recordings with progress tracking
- **Scheduled recordings** — Automatic job start/stop based on time-of-day and day-of-week
- **Admin/guest roles** — JWT cookie auth with role-based access control

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.22+ |
| HTTP Router | [chi](https://github.com/go-chi/chi) |
| Database | SQLite via [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) (pure Go, no CGO) |
| WebSocket | [nhooyr.io/websocket](https://pkg.go.dev/nhooyr.io/websocket) |
| Media | ffmpeg (transcoding), ffprobe (probing) — CLI subprocess |
| Frontend | React 18, TypeScript, Vite |
| UI | [shadcn/ui](https://ui.shadcn.com/) (Radix primitives + Tailwind CSS) |
| Player | [hls.js](https://github.com/video-dev/hls.js) |

## Prerequisites

- **Go 1.22+**
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

Default credentials: `admin` / `admin`

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
| `-watermark` | `VIEO_WATERMARK` | `true` | Enable watermark overlay on video streams |

Example:

```bash
VIEO_HTTP_ADDR=:9090 VIEO_MAX_JOBS=5 ./vieo
```

## Project Structure

```
vieo/
├── cmd/vieo/main.go              # Entrypoint — flags, config, run
├── internal/
│   ├── auth/context.go           # Context key helpers for user session
│   ├── config/config.go          # Config loading (flags → env → file)
│   ├── db/
│   │   ├── db.go                 # SQLite pool, migrations (21 entries)
│   │   └── models/               # channel.go, source.go, output.go, job.go, user.go,
│   │                             # schedule.go, export.go, event.go
│   ├── disk/disk.go              # Disk usage monitoring utilities
│   ├── server/
│   │   ├── server.go             # HTTP server setup, static file serving
│   │   ├── routes.go             # Route registration
│   │   ├── middleware.go         # AuthMiddleware, RequireRole, OptionalAuth
│   │   └── handler/              # REST + WS handlers (12 files)
│   ├── media/
│   │   ├── engine.go             # ffmpeg transcode → HLS pipeline
│   │   ├── probe.go              # ffprobe media info parsing (5 exported functions)
│   │   ├── segmenter.go          # HLS segment + playlist utilities + duration cache
│   │   └── filmstrip.go          # Thumbnail sprite sheet generation
│   └── job/
│       ├── manager.go            # Job state machine + lifecycle + live refresh
│       ├── scheduler.go          # Scheduled recording auto-start/stop
│       └── watcher.go            # Disk space monitor (pause/resume)
├── web/                          # React frontend
│   ├── src/
│   │   ├── pages/                # Dashboard, Channels, ChannelDetail,
│   │   │                         # Sources, Jobs, Player, Users, Login
│   │   ├── components/           # VideoPlayer, Sidebar, theme-provider, etc.
│   │   ├── lib/                  # API client (api.ts), utils
│   │   └── hooks/                # useWebSocket, useAuth
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── go.mod / go.sum
├── AGENTS.md                     # AI agent development guide
└── README.md                     # This file
```

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + disk stats |
| `POST` | `/api/auth/login` | Login (sets JWT cookie) |
| `POST` | `/api/auth/logout` | Logout (clears cookie) |
| `GET` | `/api/auth/me` | Get current user |
| `GET` | `/api/auth/users/` | List users (admin) |
| `POST` | `/api/auth/users/` | Create user (admin) |
| `PUT` | `/api/auth/users/{id}/password` | Reset password (admin) |
| `DELETE` | `/api/auth/users/{id}` | Delete user (admin) |
| `GET` | `/api/channels/` | List channels (guest sees public only) |
| `POST` | `/api/channels/` | Create channel (admin) |
| `GET` | `/api/channels/{id}` | Get channel |
| `PUT` | `/api/channels/{id}` | Update channel (admin) |
| `DELETE` | `/api/channels/{id}` | Delete channel (admin) |
| `GET` | `/api/sources/` | List sources (admin, filter: `?channel_id=`) |
| `POST` | `/api/sources/` | Create source (admin) |
| `GET` | `/api/sources/{id}` | Get source (admin) |
| `PUT` | `/api/sources/{id}` | Update source (admin) |
| `DELETE` | `/api/sources/{id}` | Delete source (admin) |
| `GET` | `/api/outputs/` | List outputs (admin) |
| `POST` | `/api/outputs/` | Create output (admin) |
| `GET` | `/api/outputs/{id}/storage` | Get output storage size (admin) |
| `DELETE` | `/api/outputs/{id}` | Delete output (admin) |
| `GET` | `/api/jobs/` | List jobs (admin, filter: `?status=`, `?source_id=`) |
| `POST` | `/api/jobs/` | Create + start job (admin) |
| `POST` | `/api/jobs/{id}/stop` | Stop job (admin) |
| `POST` | `/api/jobs/{id}/pause` | Pause job (admin) |
| `POST` | `/api/jobs/{id}/resume` | Resume paused job (admin) |
| `POST` | `/api/jobs/{id}/continue` | Continue job (admin) |
| `GET` | `/api/jobs/{id}/logs` | List job logs (admin) |
| `DELETE` | `/api/jobs/{id}` | Delete job (admin) |
| `POST` | `/api/jobs/{id}/events` | Create timeline event (admin) |
| `GET` | `/api/jobs/{id}/events` | List job events (authenticated) |
| `DELETE` | `/api/events/{id}` | Delete timeline event (admin) |
| `POST` | `/api/exports/` | Create export clip (admin, 300s timeout) |
| `GET` | `/api/exports/` | List exports (admin) |
| `GET` | `/api/exports/{id}` | Get export details (admin) |
| `GET` | `/api/exports/{id}/download` | Download export file (admin) |
| `DELETE` | `/api/exports/{id}` | Delete export (admin) |
| `GET` | `/api/schedules/` | List schedules (admin) |
| `POST` | `/api/schedules/` | Create schedule (admin) |
| `GET` | `/api/schedules/{id}` | Get schedule (admin) |
| `PUT` | `/api/schedules/{id}` | Update schedule (admin) |
| `DELETE` | `/api/schedules/{id}` | Delete schedule (admin) |
| `GET` | `/api/stream/{id}/*` | Serve HLS files (`.m3u8`, `.ts`, `.jpg`, `.vtt`, `.json`) |
| `WS` | `/api/ws` | Real-time job status updates (authenticated, 30s heartbeat) |

### WebSocket

Connect to `/api/ws` for real-time job events. Requires authentication.

**Event types:**

```json
{"type": "job:update",   "payload": {"id": 1, "status": "running", "progress": 0.45}}
{"type": "job:log",      "payload": {"id": 1, "level": "info", "message": "..."}}
{"type": "job:complete", "payload": {"id": 1, "status": "completed"}}
{"type": "job:error",    "payload": {"id": 1, "status": "failed", "error": "..."}}
{"type": "job:paused",   "payload": {"id": 1, "status": "paused", "reason": "..."}}
{"type": "export:progress", "payload": {"id": 1, "status": "running", "progress": 0.3}}
{"type": "export:complete", "payload": {"id": 1, "status": "completed"}}
{"type": "export:error",    "payload": {"id": 1, "status": "failed", "error": "..."}}
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
    │         │ fail               │ resume
    │    ┌────▼─────┐         ┌────┴─────┐
    │    │  failed   │         │  paused   │
    │    └──────────┘         └────┬─────┘
    │                              │ disk OK
    │    ┌──────────┐              │
    └────│completed │              │
         └──────────┘              │
                                   │ manual stop
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
6. **Manage Jobs** — Pause, stop, resume, or delete jobs from the Jobs page

## Player Features

- **Playback controls** — Play/pause, timeline scrubber, playback speed (0.5x–2x)
- **Volume** — Mute toggle + volume slider
- **Fullscreen** — Browser fullscreen API
- **Screenshots** — Canvas capture → PNG download
- **Filmstrip thumbnails** — Sprite sheet thumbnails in the seek bar for visual scrubbing
- **Timeline events** — Create markers at specific timestamps (admin)
- **Video export** — Extract clips from recordings
- **Date/time picker** — Jump to specific points in archives
- **LIVE badge** — Shown during live playback
- **Speed restriction** — Limited to ≤1x during live streams

## Disk Management

vieo monitors disk usage every 30 seconds:

- **Warning threshold** (default 90%) — Running transcoding jobs are paused
- **Critical threshold** (default 95%) — All jobs are force-stopped
- When disk usage drops below the warning threshold, paused jobs automatically resume

## Scheduled Recordings

Configure schedules to automatically start and stop recordings:

- Set start/end times in HH:MM format (24h)
- Choose which days of the week to record
- vieo automatically creates outputs and starts/stops jobs based on the schedule

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
