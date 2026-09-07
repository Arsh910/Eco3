package main

import (
	"log"

	"github.com/gin-gonic/gin"
)

func (app *application) handleSocket(c *gin.Context) {
	conn, err := app.upg.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println(err)
		return
	}
	defer conn.Close()
	defer app.hub.Remove(conn)

	app.hub.Add(conn)
	log.Println("peer connected")

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			break
		}
		app.hub.BroadcastExcept(conn, msg)
	}
}
