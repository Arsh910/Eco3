package main

import (
	"log"
	"net/http"
	"server/internal/env"
	"server/internal/hub"
	"server/internal/room"

	"github.com/gorilla/websocket"
)

type application struct {
	port int
	upg  websocket.Upgrader
	hub  *hub.Hub
	rm   *room.RoomManger
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	app := &application{
		port: env.GetEnvInt("PORT", 8080),
		upg:  upgrader,
		hub:  hub.New(),
		rm:   room.NewRoomManager(),
	}

	if err := app.serve(); err != nil {
		log.Fatal(err)
	}
}
