package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/ratelimit"
)

func (app *application) routes() http.Handler {
	g := gin.Default()
	r1 := ratelimit.New(100)

	v1 := g.Group("api/v1")
	v1.Use(cors(app.corsOrigins))
	v1.Use(rateLimiter(r1))
	{
		v1.POST("/room/create", app.HandleCreateRoom)
		v1.GET("/ws/:code", app.handleJoinRoom)
	}
	return g
}
