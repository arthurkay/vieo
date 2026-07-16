# syntax=docker/dockerfile:1

# ---------- Frontend build ----------
FROM node:20-slim AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---------- Backend build ----------
FROM golang:1.25-alpine AS backend
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/vieo ./cmd/vieo

# ---------- Runtime ----------
FROM alpine:3.20

# ffmpeg + ffprobe are required at runtime by the media engine
RUN apk add --no-cache ffmpeg tini ca-certificates

WORKDIR /app
COPY --from=backend /out/vieo /app/vieo
COPY --from=frontend /app/web/dist /app/web/dist

# Runtime data
ENV VIEO_HTTP_ADDR=:8080 \
    VIEO_DB_PATH=/app/data/vieo.db \
    VIEO_DATA_DIR=/app/data

VOLUME ["/app/data"]

EXPOSE 8080

# tini reaps zombies and forwards signals for graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/vieo"]
