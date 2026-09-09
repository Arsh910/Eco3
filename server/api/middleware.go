package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/ratelimit"
)

func cors(origins []string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		allowed[strings.TrimSpace(origin)] = true
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		c.Header("Vary", "Origin")

		if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func rateLimiter(rl ratelimit.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		rl.Take()
		c.Next()
	}
}
