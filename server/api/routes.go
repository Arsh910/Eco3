package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (app *application) routes() http.Handler {
	g := gin.Default()

	v1 := g.Group("api/v1")
	{
		v1.GET("ws", app.handleSocket)
	}
	return g
}
