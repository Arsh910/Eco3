package main

import (
	"net/http"
	"time"

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
		v1.GET("/health", func(c *gin.Context) {
			var startedAt = time.Now()
			c.JSON(200, gin.H{
				"status": "ok",
				"rooms":  app.rm.Count(),
				"uptime": time.Since(startedAt).String(),
			})
		})
		v1.POST("/room/create", app.HandleCreateRoom)
		v1.GET("/ws/:code", app.handleJoinRoom)
	}
	return g
}
