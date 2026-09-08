package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (app *application) HandleCreateRoom(c *gin.Context) {
	room := app.rm.CreateRoom()
	c.JSON(http.StatusCreated, gin.H{"code": room.Code})
}
