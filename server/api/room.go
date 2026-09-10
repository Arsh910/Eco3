package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"server/internal/room"
	"strings"

	"github.com/gin-gonic/gin"
)

func (app *application) HandleCreateRoom(c *gin.Context) {
	room := app.rm.CreateRoom()
	c.JSON(http.StatusCreated, gin.H{"code": room.Code})
}

func generatePeerID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

const maxAliasLength = 12

func sanitizeAlias(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if b.Len() >= maxAliasLength {
			break
		}
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func peerID(alias string) string {
	id := generatePeerID()
	if alias = sanitizeAlias(alias); alias != "" {
		return alias + "-" + id
	}
	return id
}

type SignalMessage struct {
	Type string          `json:"type"`
	To   string          `json:"to"`
	From string          `json:"from"`
	Raw  json.RawMessage `json:"-"`
}

func (app *application) handleJoinRoom(c *gin.Context) {
	code := c.Param("code")

	rom, err := app.rm.GetRoom(code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
		return
	}

	conn, err := app.upg.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "something wrong while connecting to socket"})
		return
	}
	defer conn.Close()

	peer := &room.Peer{
		ID:   peerID(c.Query("alias")),
		Conn: conn,
	}

	if err := rom.JoinRoom(peer); err != nil {
		peer.Send(gin.H{"type": "error", "message": err.Error()})
		return
	}

	defer rom.LeaveRoom(peer.ID)
	defer app.rm.RemoveRoomIfEmpty(code)

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			fmt.Println("read error:", err)
			break
		}

		var sig SignalMessage
		if err := json.Unmarshal(raw, &sig); err != nil {
			continue
		}

		var full map[string]any
		if err := json.Unmarshal(raw, &full); err != nil {
			continue
		}

		full["from"] = peer.ID
		stamped, err := json.Marshal(full)
		if err != nil {
			continue
		}

		if sig.To != "" {
			rom.RouteTo(sig.To, stamped)
		} else {
			log.Println("message with no target from", peer.ID, "type", sig.Type)
		}
	}
}
