package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/arthur/vieo/internal/job"
	"nhooyr.io/websocket"
)

type WSHub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

var hub = &WSHub{
	clients: make(map[*websocket.Conn]struct{}),
}

func StartBroadcastLoop(ctx context.Context, mgr *job.Manager) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case evt, ok := <-mgr.Events():
				if !ok {
					return
				}
				data, err := json.Marshal(evt)
				if err != nil {
					continue
				}

				hub.mu.RLock()
				for c := range hub.clients {
					if err := c.Write(ctx, websocket.MessageText, data); err != nil {
						log.Printf("ws write: %v", err)
					}
				}
				hub.mu.RUnlock()
			}
		}
	}()
}

func WebSocket(db *sql.DB, mgr *job.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			log.Printf("ws accept: %v", err)
			return
		}

		hub.mu.Lock()
		hub.clients[conn] = struct{}{}
		hub.mu.Unlock()

		defer func() {
			hub.mu.Lock()
			delete(hub.clients, conn)
			hub.mu.Unlock()
			conn.Close(websocket.StatusNormalClosure, "bye")
		}()

		ctx := r.Context()

		// Read loop (for pong/ping and client messages)
		for {
			_, _, err := conn.Read(ctx)
			if err != nil {
				break
			}
		}
	}
}
