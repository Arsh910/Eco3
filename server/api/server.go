package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

func (app *application) serve() error {
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", app.port),
		Handler:      app.routes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  time.Second * 10,
		WriteTimeout: time.Second * 100,
	}

	log.Printf("starting server at %d", app.port)

	return server.ListenAndServe()
}
