package model

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/renant/lol-api/database"
)

type ChampionCounter struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	WinRate float64 `json:"winRate"`
}

type Champion struct {
	ID         string                     `json:"id"`
	ImageURL   string                     `json:"imageUrl"`
	LastUpdate int64                      `json:"lastUpdate"`
	Name       string                     `json:"name"`
	WinRate    float64                    `json:"winRate"`
	Losses     map[string]ChampionCounter `json:"losses,omitempty"`
	Winner     map[string]ChampionCounter `json:"winner,omitempty"`
	WellWith   map[string]ChampionCounter `json:"wellWith,omitempty"`
}

func LoadChampionList(ids []string) ([]Champion, error) {
	var champions []Champion

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	var mutex = &sync.Mutex{}
	championRef := database.FirebaseDB.NewRef("/champions")

	for i := 0; i < len(ids); i++ {
		id := ids[i]
		wg.Add(1)
		go func(id string, wg *sync.WaitGroup) {
			defer wg.Done()
			var data Champion
			err := championRef.Child(id).Get(ctx, &data)
			if err == nil {
				mutex.Lock()
				champions = append(champions, data)
				mutex.Unlock()
			}
		}(id, &wg)
	}

	timeout := make(chan bool, 1)
	done := make(chan bool, 1)

	go func() {
		time.Sleep(5 * time.Second)
		cancel()
		timeout <- true
	}()

	go func() {
		wg.Wait()
		done <- true
	}()

	select {
	case <-done:
		return champions, nil
	case <-timeout:
		return nil, errors.New("Timeout getting champions data")
	}
}
