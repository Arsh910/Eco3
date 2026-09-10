package main

import (
	"bytes"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

const (
	targetURL     = "http://localhost:8080/api/v1/room/create"
	totalRequests = 300
	maxConcurrent = 50
)

func main() {
	var wg sync.WaitGroup
	var success, rateLimited, other int64

	client := &http.Client{Timeout: 5 * time.Second}
	body := []byte(`{}`)
	sem := make(chan struct{}, maxConcurrent)
	start := time.Now()

	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(n int) {
			defer wg.Done()
			defer func() { <-sem }()

			resp, err := client.Post(targetURL, "application/json", bytes.NewReader(body))
			if err != nil {
				fmt.Printf("request %d failed: %v\n", n, err)
				atomic.AddInt64(&other, 1)
				return
			}
			defer resp.Body.Close()

			switch resp.StatusCode {
			case http.StatusOK, http.StatusCreated:
				atomic.AddInt64(&success, 1)
			case http.StatusTooManyRequests:
				atomic.AddInt64(&rateLimited, 1)
			default:
				fmt.Printf("request %d got unexpected status: %d\n", n, resp.StatusCode)
				atomic.AddInt64(&other, 1)
			}
		}(i)
	}

	wg.Wait()
	elapsed := time.Since(start)

	fmt.Println("----------------------------")
	fmt.Printf("Total requests sent: %d\n", totalRequests)
	fmt.Printf("Success (2xx):       %d\n", success)
	fmt.Printf("Rate limited (429):  %d\n", rateLimited)
	fmt.Printf("Other/errors:        %d\n", other)
	fmt.Printf("Time taken:          %v\n", elapsed)
	fmt.Println("----------------------------")
	fmt.Println("Note: go.uber.org/ratelimit BLOCKS instead of rejecting.")
	fmt.Println("So expect all requests to succeed with 0 in 'Other/errors',")
	fmt.Println("and 'Time taken' should be roughly (totalRequests / your rate)")
	fmt.Println("instead of near-instant, if the limiter is actually engaged.")
	fmt.Println("maxConcurrent just paces how many requests are in flight at once")
	fmt.Println("on the CLIENT side, so we don't flood the local OS listen backlog.")
}
