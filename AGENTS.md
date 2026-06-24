# vieo — AI Agent Guide

## Overview

vieo is a Go-based video streaming platform that transcodes media sources into HLS for web playback. It manages channels, sources, outputs, and encoding jobs through a SQLite database, with a React + shadcn UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.22+ |
| HTTP Router | `chi` (stdlib-compatible) |
| Database | SQLite via `modernc.org/sqlite` (pure Go, no CGO) |
| WebSocket | `nhooyr.io/websocket` |
| Media | `ffprobe` (probing), `ffmpeg` (transcoding) — both via CLI subprocess |
| Frontend | React 18 + Vite + TypeScript |
| UI | shadcn/ui (Radix primitives + Tailwind CSS) |
| Player | hls.js |

## Directory Structure

```
vieo/
├── cmd/vieo/main.go          # Entrypoint — flags, config, run
├── internal/
│   ├── config/config.go      # Config loading (flags → env → file)
│   ├── db/
│   │   ├── db.go             # SQLite pool, migrations
│   │   └── models/           # channel.go, source.go, output.go, job.go
│   ├── server/
│   │   ├── server.go         # HTTP server setup, middleware
│   │   └── handler/          # REST + WS handlers
│   ├── media/
│   │   ├── engine.go         # ffmpeg transcode → HLS pipeline
│   │   ├── probe.go          # ffprobe media info parsing
│   │   └── segmenter.go      # HLS segment + playlist writer
│   └── job/
│       ├── manager.go        # Job state machine + lifecycle
│       └── watcher.go        # Disk space monitor
├── web/                      # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable components
│   │   ├── lib/              # API client, WS client
│   │   └── hooks/            # Custom hooks
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── go.mod / go.sum
├── AGENTS.md                 # This file
└── VIEO.md                   # Platform design document
```

## Development Commands

```bash
# Backend
go build ./cmd/vieo          # Build
go run ./cmd/vieo            # Run (with default flags)
go run ./cmd/vieo -h         # See all flags
go test ./...                # Run all tests
go vet ./...                 # Static analysis

# Frontend
cd web && npm install        # Install deps
cd web && npm run dev        # Dev server (port 5173)
cd web && npm run build      # Production build
cd web && npm run lint       # Lint
```

## Coding Conventions

### Go

- **Imports**: stdlib → third-party → internal (three groups with blank line separators)
- **Error handling**: Always check errors. Wrap with `fmt.Errorf("context: %w", err)` for propagation.
- **Naming**: `camelCase` unexported, `PascalCase` exported. Acronyms uppercase (HTTP, URL, ID).
- **Context**: First argument in all public functions that do I/O.
- **SQL**: Use prepared statements via `database/sql`. Migrations in `db.go` as ordered string array.
- **Handlers**: Follow the `func(w http.ResponseWriter, r *http.Request)` pattern. Use chi's URL params via `chi.URLParam(r, "id")`.

### React

- **Functional components** with hooks, no classes.
- **TypeScript** — strict mode. Define types in `types.ts` or co-located.
- **shadcn** — use `cn()` for class merging, `cva()` for variant props.
- **State** — React Query (`@tanstack/react-query`) for server state, `useState`/`useReducer` for local.
- **WS** — Custom hook `useWebSocket` in `hooks/use-websocket.ts`.
- **Pages** — One file per route in `pages/`. Components in `components/`.

### Database

- All schema changes go in `internal/db/db.go` as ordered migration strings.
- Migration IDs are timestamps: `"001_create_channels"`, `"002_create_sources"`, etc.
- Models are plain structs with `db` tags. Use `sql.Null*` for nullable fields.
- Never use raw SQL in handlers — always go through model functions.

## Common Tasks

### Add a new API endpoint

1. Define handler in `internal/server/handler/<resource>.go`
2. Register route in `internal/server/routes.go`
3. Add model function in `internal/db/models/<model>.go`
4. If real-time: emit WS event in handler

### Add a database migration

1. Append to `migrations` slice in `internal/db/db.go`
2. Add model struct + CRUD functions in `internal/db/models/`
3. Update any affected handlers

### Add a new media format (input)

1. Update `internal/media/probe.go` to detect format
2. Verify the ffmpeg transcode command in `engine.go` handles it
3. Add format-specific validation in handler

### Add a new page (frontend)

1. Create page component in `web/src/pages/`
2. Add route in `web/src/App.tsx`
3. Add API call in `web/src/lib/api.ts`
4. Add navigation link if needed

## API Overview

### REST Endpoints

```
GET    /api/health            # Health check
GET    /api/channels          # List channels
POST   /api/channels          # Create channel
GET    /api/channels/{id}     # Get channel
PUT    /api/channels/{id}     # Update channel
DELETE /api/channels/{id}     # Delete channel

GET    /api/sources           # List sources (filter by ?channel_id=)
POST   /api/sources           # Create source
GET    /api/sources/{id}      # Get source
DELETE /api/sources/{id}      # Delete source

GET    /api/outputs           # List outputs
POST   /api/outputs           # Create output
DELETE /api/outputs/{id}      # Delete output

GET    /api/jobs              # List jobs (filter by ?status=, ?source_id=)
POST   /api/jobs              # Create + start job
POST   /api/jobs/{id}/stop    # Stop job
DELETE /api/jobs/{id}         # Delete job record

GET    /api/stream/{id}/*     # Serve HLS files (.m3u8, .ts)

WS     /api/ws                # Real-time job status updates
```

### WebSocket Events (server → client)

```json
{"type":"job:update","payload":{"id":1,"status":"running","progress":0.45}}
{"type":"job:log","payload":{"id":1,"level":"info","message":"segment 42"}}
{"type":"job:complete","payload":{"id":1,"status":"completed"}}
{"type":"job:error","payload":{"id":1,"status":"failed","error":"..."}}
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

## Testing Strategy

- **Go backend**: `_test.go` files alongside code. Use `testing` stdlib + `github.com/stretchr/testify` if needed.
- **Database**: Use in-memory SQLite for tests (`:memory:`). Run migrations before each test.
- **Media**: Mock ffprobe/ffmpeg outputs. Do not depend on actual binaries in unit tests.
- **Frontend**: Vitest + React Testing Library. Mock API calls with MSW.
- **E2E**: Plan to add Playwright tests later.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VIEO_DB_PATH` | `./vieo.db` | SQLite database file |
| `VIEO_DATA_DIR` | `./data` | Output directory for HLS segments |
| `VIEO_HTTP_ADDR` | `:8080` | HTTP server address |
| `VIEO_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `VIEO_DISK_WARN` | `90` | Disk usage % to trigger pause |
| `VIEO_DISK_CRIT` | `95` | Disk usage % to force stop |
| `VIEO_MAX_JOBS` | `3` | Maximum concurrent transcoding jobs |
