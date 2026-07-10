# vieo — AI Agent Guide

## Overview

vieo is a Go-based video streaming platform that transcodes media sources into HLS for web playback. It manages channels, sources, outputs, encoding jobs, and scheduled recordings through a SQLite database. Features include JWT cookie-based auth with admin/guest roles, real-time WebSocket job updates, a custom HLS video player with thumbnail timeline scrubbing, and automatic live playlist management for continuous archive seeking.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.22+ |
| HTTP Router | `chi` (stdlib-compatible) |
| Database | SQLite via `modernc.org/sqlite` (pure Go, no CGO) |
| WebSocket | `nhooyr.io/websocket` |
| Auth | JWT (`github.com/golang-jwt/jwt/v5`), bcrypt (`golang.org/x/crypto`) |
| Media | `ffprobe` (probing), `ffmpeg` (transcoding) — both via CLI subprocess |
| Frontend | React 18 + Vite + TypeScript |
| UI | shadcn/ui (Radix primitives + Tailwind CSS) |
| Player | hls.js |
| State | Tanstack Query (server state), React Context (auth/theme) |

## Directory Structure

```
vieo/
├── cmd/vieo/main.go              # Entrypoint — flags, config, admin seeding, run
├── internal/
│   ├── auth/context.go           # Context key helpers for user session
│   ├── config/config.go          # Config loading (flags → env → file)
│   ├── db/
│   │   ├── db.go                 # SQLite pool, migrations (16 tables)
│   │   └── models/
│   │       ├── channel.go        # Channel CRUD, public/private listing
│   │       ├── source.go         # Source CRUD, name editing, metadata updates
│   │       ├── output.go         # Output CRUD, source-based lookup
│   │       ├── job.go            # Job lifecycle, logs, status transitions
│   │       ├── user.go           # User CRUD, bcrypt, password reset
│   │       └── schedule.go       # Schedule CRUD, enabled listing, job binding
│   ├── disk/disk.go              # Disk usage monitoring utilities
│   ├── server/
│   │   ├── server.go             # HTTP server setup, static file serving
│   │   ├── routes.go             # All route registration with auth middleware
│   │   ├── middleware.go          # AuthMiddleware, RequireRole, OptionalAuth
│   │   └── handler/
│   │       ├── health.go         # GET /api/health
│   │       ├── auth.go           # Login, logout, me, user management, password reset
│   │       ├── channels.go       # Channel CRUD (public/private)
│   │       ├── sources.go        # Source CRUD + name editing
│   │       ├── outputs.go        # Output CRUD + storage info
│   │       ├── jobs.go           # Job CRUD + stop/pause/resume/continue
│   │       ├── schedules.go      # Schedule CRUD
│   │       ├── stream.go         # HLS file serving (.m3u8, .ts, .jpg)
│   │       ├── ws.go             # WebSocket hub + broadcast loop
│   │       └── helpers.go        # JSON response helpers
│   ├── media/
│   │   ├── engine.go             # ffmpeg transcode → HLS pipeline
│   │   ├── probe.go              # ffprobe media info parsing (v4l2, file, stream)
│   │   └── segmenter.go          # Playlist write/refresh, segment management
│   └── job/
│       ├── manager.go            # Job state machine + lifecycle + live refresh
│       ├── scheduler.go          # Scheduled recording auto-start/stop
│       └── watcher.go            # Disk space monitor (pause/resume)
├── web/                          # React frontend
│   ├── src/
│   │   ├── main.tsx              # App entry point
│   │   ├── App.tsx               # Router + auth-protected routes
│   │   ├── types.ts              # All TypeScript interfaces
│   │   ├── index.css             # Tailwind base styles
│   │   ├── lib/
│   │   │   ├── api.ts            # REST API client (all endpoints)
│   │   │   └── utils.ts          # cn() helper
│   │   ├── hooks/
│   │   │   ├── use-auth.tsx      # AuthProvider + useAuth hook
│   │   │   └── use-websocket.ts  # WebSocket connection hook
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Overview: running jobs, disk, storage
│   │   │   ├── Channels.tsx     # Channel list + create/edit (public/private, admin-only actions)
│   │   │   ├── ChannelDetail.tsx # Channel sources + transcode controls
│   │   │   ├── Sources.tsx       # Source list + inline name edit + schedules
│   │   │   ├── Jobs.tsx          # Job list + logs + stop/pause/resume
│   │   │   ├── Player.tsx        # HLS player with date/time seeking
│   │   │   ├── Users.tsx         # User management + password reset (admin)
│   │   │   └── Login.tsx         # Login page
│   │   └── components/
│   │       ├── Sidebar.tsx       # Navigation (role-based visibility)
│   │       ├── VideoPlayer.tsx   # Custom HLS player: controls, thumbnails, screenshot
│   │       ├── storage-banner.tsx# Disk usage warning banner
│   │       ├── theme-provider.tsx# Dark/light mode provider
│   │       └── ui/               # shadcn components (16 files)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── go.mod / go.sum
├── AGENTS.md                     # This file
└── VIEO.md                       # Platform design document
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
- **Auth**: Cookie-based JWT (`vieo_session`). Middleware chain: `AuthMiddleware` → `RequireRole("admin")`. Public routes use `OptionalAuth` or no auth.

### React

- **Functional components** with hooks, no classes.
- **TypeScript** — strict mode. Define types in `types.ts` or co-located.
- **shadcn** — use `cn()` for class merging, `cva()` for variant props.
- **State** — React Query (`@tanstack/react-query`) for server state, `useState`/`useReducer` for local.
- **Auth** — React Context via `AuthProvider` + `useAuth()` hook. Cookie-based, no JS token storage.
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
2. Register route in `internal/server/routes.go` with appropriate auth middleware
3. Add model function in `internal/db/models/<model>.go`
4. If real-time: emit WS event in handler
5. Add API client function in `web/src/lib/api.ts`
6. Update TypeScript types in `web/src/types.ts` if needed

### Add a database migration

1. Append to `migrations` slice in `internal/db/db.go`
2. Add model struct + CRUD functions in `internal/db/models/`
3. Update any affected handlers

### Add a new media format (input)

1. Update `internal/media/probe.go` to detect format
2. Verify the ffmpeg transcode command in `engine.go` handles it
3. Add format-specific validation in handler
4. Add source type to the CHECK constraint in the sources table migration

### Add a new page (frontend)

1. Create page component in `web/src/pages/`
2. Add route in `web/src/App.tsx` with auth wrapper
3. Add API call in `web/src/lib/api.ts`
4. Add navigation link in `Sidebar.tsx` if needed

## Authentication & Authorization

### How it works

- **JWT cookie auth**: Login sets `vieo_session` HTTP-only cookie with HS256-signed JWT containing `user_id`.
- **Default admin**: On first startup, `admin`/`admin` user is seeded with `admin` role.
- **Roles**: `admin` (full access) and `guest` (view public channels + streams only).
- **Middleware chain**: `AuthMiddleware` → `RequireRole("admin")` on mutations. `OptionalAuth` on read-only channels.

### User roles permissions

| Action | Admin | Guest |
|--------|-------|-------|
| View public channels | Yes | Yes |
| View all channels | Yes | No |
| Create/edit/delete channels | Yes | No |
| Create/edit/delete sources | Yes | No |
| Start/stop/pause jobs | Yes | No |
| Manage users | Yes | No |
| Manage schedules | Yes | No |
| View HLS streams | Yes | Yes |

### Auth middleware

- `AuthMiddleware(db, jwtSecret)` — Returns 401 if not authenticated
- `RequireRole(roles ...string)` — Returns 403 if role not in allowed list
- `OptionalAuth(db, jwtSecret)` — Silently continues if not authenticated
- Guest access: channels list returns only `public=true` channels via `ListPublicChannels()`

## API Overview

### REST Endpoints

```
# Health
GET    /api/health                        # Health check (no auth)

# Authentication
POST   /api/auth/login                    # Login (sets JWT cookie)
POST   /api/auth/logout                   # Logout (clears cookie)
GET    /api/auth/me                       # Get current user

# User Management (admin only)
GET    /api/auth/users/                   # List users
POST   /api/auth/users/                   # Create user
PUT    /api/auth/users/{id}/password      # Reset user password
DELETE /api/auth/users/{id}               # Delete user

# Sources (admin only)
GET    /api/sources/                      # List sources (filter by ?channel_id=)
POST   /api/sources/                      # Create source
GET    /api/sources/{id}                  # Get source
PUT    /api/sources/{id}                  # Update source (name editing)
DELETE /api/sources/{id}                  # Delete source

# Outputs (admin only)
GET    /api/outputs/                      # List outputs
POST   /api/outputs/                      # Create output
GET    /api/outputs/{id}/storage          # Get output storage size (bytes)
DELETE /api/outputs/{id}                  # Delete output

# Jobs (admin only)
GET    /api/jobs/                         # List jobs (filter by ?status=, ?source_id=)
POST   /api/jobs/                         # Create + start job
POST   /api/jobs/{id}/stop               # Stop job (finalizes playlist)
POST   /api/jobs/{id}/pause              # Pause job (finalizes playlist, saves state)
POST   /api/jobs/{id}/resume             # Resume paused job (from last segment)
POST   /api/jobs/{id}/continue           # Continue job
GET    /api/jobs/{id}/logs               # List job logs
DELETE /api/jobs/{id}                     # Delete job record (stops if running)

# Schedules (admin only)
GET    /api/schedules/                    # List schedules (filter by ?source_id=)
POST   /api/schedules/                    # Create schedule
GET    /api/schedules/{id}               # Get schedule
PUT    /api/schedules/{id}               # Update schedule
DELETE /api/schedules/{id}               # Delete schedule

# Channels (optional auth — guests see public only)
GET    /api/channels/                     # List channels (public for guests, all for admins)
GET    /api/channels/{id}                 # Get channel
POST   /api/channels/                     # Create channel (admin only)
PUT    /api/channels/{id}                 # Update channel (admin only)
DELETE /api/channels/{id}                 # Delete channel (admin only)

# Streaming (public)
GET    /api/stream/{id}/*                 # Serve HLS files (.m3u8, .ts, .jpg)

# WebSocket (public)
WS     /api/ws                            # Real-time job status updates

# Frontend (public)
*      /*                                 # React SPA static files
```

### WebSocket Events (server → client)

```json
{"type":"job:update","payload":{"id":1,"status":"running","progress":0.45}}
{"type":"job:log","payload":{"id":1,"level":"info","message":"segment 42"}}
{"type":"job:complete","payload":{"id":1,"status":"completed"}}
{"type":"job:error","payload":{"id":1,"status":"failed","error":"..."}}
{"type":"job:paused","payload":{"id":1,"status":"paused","reason":"interrupted"}}
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

### Lifecycle details

- **Start**: Creates job record → launches goroutine → probes source → starts ffmpeg
- **Pause**: Cancels ffmpeg context → `FinalizePlaylist` writes `#EXT-X-ENDLIST` → saves last segment number
- **Resume**: Reads last segment number → starts ffmpeg with `-start_number N+1` → continues playlist
- **Stop**: Same as pause (finalizes playlist) → marks status `stopped`
- **Live refresh**: For live sources (rtmp/rtsp/device/hls), a goroutine calls `RefreshLivePlaylist` every 5s, rebuilding the playlist from ALL `.ts` files on disk without `#EXT-X-ENDLIST`
- **Completion**: ffmpeg exits naturally → `FinalizePlaylist` → marks `completed`

## Scheduled Recordings

The `Scheduler` goroutine runs every 30 seconds and manages automatic job lifecycle:

1. Checks all enabled schedules against current time and day-of-week
2. If a schedule's time window matches and no job is running → creates output + starts job
3. If a schedule's end time is reached → pauses the running job
4. Day matching uses comma-separated abbreviations: `Mon,Tue,Wed,Thu,Fri`

Schedule configuration:
- `start_time` — HH:MM format (24h)
- `end_time` — HH:MM format (24h), nullable for open-ended
- `days_of_week` — Comma-separated day abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun)

## HLS Playlist Management

### FinalizePlaylist

Called on job stop/pause/completion. Scans all `.ts` files on disk, sorts by segment number, and writes a complete `.m3u8` playlist with `#EXT-X-ENDLIST` tag. Handles orphaned segments from previous sessions. Writes are **atomic**: the playlist is written to a `playlist.m3u8.tmp` file and renamed into place to avoid serving a half-written playlist to clients.

### RefreshLivePlaylist

Called every 5 seconds by a background goroutine during live recording. Same as FinalizePlaylist but **without** `#EXT-X-ENDLIST`, keeping the playlist as a live HLS stream. Ensures the player can seek through the full archive during active recording. Uses the same atomic tmp-file + rename write strategy.

### Stream response headers

The HLS file server (`stream.go`) sets content-type and caching headers per extension:

- `.m3u8` — `application/vnd.apple.mpegurl` with `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0` so players always fetch a fresh playlist.
- `.ts` — `video/mp2t` with `Cache-Control: public, max-age=3600` (segments are immutable once written).
- `.jpg` — thumbnail poster image.

### Video player HLS.js config

- `liveDurationInfinity: false` — duration reflects total archive length
- `lowLatencyMode: false` — allows seeking to older content
- `backBufferLength: Infinity` — keeps all segments in memory
- `maxBufferLength: 60` — 60 seconds forward buffer
- `maxMaxBufferLength: 300` — up to 5 minutes buffered

## Video Player Features

The custom `VideoPlayer` component provides:

- **Playback controls**: Play/pause, timeline scrubber (Radix Slider), playback speed (0.5x/1x/1.5x/2x)
- **Volume**: Mute toggle + volume slider
- **Fullscreen**: Browser fullscreen API
- **Screenshots**: Canvas capture → PNG download
- **Timeline thumbnails**: On hover, seeks hidden video element, draws frame to 160×90px floating thumbnail with time label
- **Auto-hide controls**: Controls fade after 3 seconds of inactivity
- **LIVE badge**: Shown when streaming live content
- **Date/time picker**: In Player page, allows jumping to specific points in archives

## Frontend Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/login` | `Login` | None | Login page |
| `/player/:outputId` | `Player` | None | HLS player with seeking |
| `/` | `Dashboard` | Protected | Running jobs, disk, storage overview |
| `/channels` | `Channels` | Protected | Channel list + create/edit (public/private, admin-only actions) |
| `/channels/:id` | `ChannelDetail` | Protected | Sources + transcode controls |
| `/sources` | `Sources` | Protected (admin) | Source list + inline edit + schedules |
| `/jobs` | `Jobs` | Protected (admin) | Job list + logs + controls |
| `/users` | `Users` | Protected (admin) | User management + password reset |

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
| `VIEO_WATERMARK` | `true` | Enable watermark overlay on video streams |
| `VIEO_JWT_SECRET` | auto-generated | HS256 signing key for JWT cookies (32-byte hex) |
| `VIEO_AUTH_ENABLED` | `true` | Enable JWT auth; when false, all requests are unauthenticated |
