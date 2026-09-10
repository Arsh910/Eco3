package main

import (
	"log"
	"net/http"
	"server/internal/env"
	"server/internal/room"
	"strings"

	"github.com/gorilla/websocket"
)

type application struct {
	port        int
	upg         websocket.Upgrader
	rm          *room.RoomManger
	corsOrigins []string
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	app := &application{
		port: env.GetEnvInt("PORT", 8080),
		upg:  upgrader,
		rm:   room.NewRoomManager(),
		corsOrigins: strings.Split(
			env.GetEnvString("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
			",",
		),
	}

	if err := app.serve(); err != nil {
		log.Fatal(err)
	}
}
