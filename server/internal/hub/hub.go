package hub

import (
	"sync"

	"github.com/gorilla/websocket"
)

type Hub struct {
	mu    sync.Mutex
	peers []*websocket.Conn
}

func New() *Hub {
	return &Hub{}
}

func (h *Hub) Add(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.peers = append(h.peers, conn)
}

func (h *Hub) Remove(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for i, p := range h.peers {
		if p == conn {
			h.peers = append(h.peers[:i], h.peers[i+1:]...)
			break
		}
	}
}

func (h *Hub) BroadcastExcept(sender *websocket.Conn, msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, p := range h.peers {
		if p != sender {
			p.WriteMessage(websocket.TextMessage, msg)
		}
	}
}
