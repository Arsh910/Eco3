package room

import (
	"crypto/rand"
	"errors"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	roomCodeChars  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	roomCodeLength = 6
	maxRoomMembers = 2
)

var (
	ErrRoomFull     = errors.New("room is full")
	ErrRoomNotFound = errors.New("room not found")
)

type Room struct {
	Code  string
	peers map[*websocket.Conn]bool
	mu    sync.Mutex
}

type RoomManger struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

func NewRoomManager() *RoomManger {
	return &RoomManger{
		rooms: make(map[string]*Room),
	}
}

func GenerateRoomCode() string {
	b := make([]byte, roomCodeLength)

	// cryptographically random bytes
	rand.Read(b)

	code := make([]byte, roomCodeLength)
	for i, v := range b {
		code[i] = roomCodeChars[int(v)%len(roomCodeChars)]
	}
	return string(code)
}

func (rm *RoomManger) CreateRoom() *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	var code string
	for {
		code = GenerateRoomCode()
		if _, exsists := rm.rooms[code]; !exsists {
			break
		}
	}

	room := &Room{
		Code:  code,
		peers: make(map[*websocket.Conn]bool),
	}

	rm.rooms[code] = room
	log.Println("room created:", code)
	return room
}

func (rm *RoomManger) GetRoom(code string) (*Room, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, exists := rm.rooms[code]

	if !exists {
		return nil, ErrRoomNotFound
	}

	return room, nil
}

func (rm *RoomManger) RemoveRoomIfEmpty(code string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, exists := rm.rooms[code]

	if !exists {
		return
	}

	room.mu.Lock()
	empty := len(room.peers) == 0
	room.mu.Unlock()

	if empty {
		delete(rm.rooms, code)
		log.Println("room removed: ", code)
	}
}

func (r *Room) JoinRoom(conn *websocket.Conn) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.peers) >= maxRoomMembers {
		return ErrRoomFull
	}

	r.peers[conn] = true
	log.Println("peer joined room", r.Code, "| total peers: ", len(r.peers))
	return nil
}

func (r *Room) LeaveRoom(conn *websocket.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.peers, conn)
	log.Println("peer left room", r.Code, "| total peers: ", len(r.peers))
}

func (r *Room) BroadcastExcept(sender *websocket.Conn, msg []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for peer := range r.peers {
		if peer != sender {
			peer.WriteMessage(websocket.TextMessage, msg)
		}
	}
}
