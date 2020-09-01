package main

import (
	"context"
	"errors"
	"log"
	"os"
	"sort"
	"sync"
	"time"

	firebase "firebase.google.com/go"
	"firebase.google.com/go/db"
	"github.com/gofiber/fiber"
	"github.com/joho/godotenv"
)

var fbDb *db.Client

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
	championRef := fbDb.NewRef("/champions")

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

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Println("Error loading .env file")
	}

	app := fiber.New()

	port := "3000"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	projectID := os.Getenv("GCP_PROJECT")
	if projectID == "" {
		projectID = os.Getenv("GOOGLE_CLOUD_PROJECT")
	}

	config := &firebase.Config{
		ProjectID:   projectID,
		DatabaseURL: "https://" + projectID + ".firebaseio.com",
	}
	ctx := context.Background()
	fbApp, err := firebase.NewApp(ctx, config)
	if err != nil {
		log.Fatalf("error initializing app: %v\n", err)
	}

	fbDb, err = fbApp.Database(ctx)
	if err != nil {
		log.Fatalln("Error initializing database client:", err)
	}

	app.Get("/", func(c *fiber.Ctx) {
		c.Send("Hello!")
	})

	app.Get("/champion/:championID", func(c *fiber.Ctx) {
		championID := c.Params("championID")
		ctx := context.Background()
		champion := &Champion{}
		err := fbDb.NewRef("/champions").Child(championID).Get(ctx, champion)
		if err != nil {
			c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
			return
		}

		if champion.ID == "" {
			c.Status(404).JSON(map[string]string{"message": "Champion not found"})
			return
		}

		c.Status(200).JSON(champion)
	})

	app.Get("/recommend/:championID", func(c *fiber.Ctx) {
		championID := c.Params("championID")
		ctx := context.Background()
		var data Champion
		err := fbDb.NewRef("/champions").Child(championID).Get(ctx, &data)
		if err != nil {
			c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
		}

		if data.ID == "" {
			c.Status(404).JSON(map[string]string{"message": "Champion not found"})
			return
		}

		championsLosses := make([]ChampionCounter, 0, len(data.Losses))
		for _, champion := range data.Losses {
			championsLosses = append(championsLosses, champion)
		}

		sort.Slice(championsLosses, func(i, j int) bool {
			return championsLosses[i].WinRate < championsLosses[j].WinRate
		})

		chapionsIds := make([]string, 0, 3)
		for _, champion := range championsLosses[0:3] {
			chapionsIds = append(chapionsIds, champion.ID)
		}

		loadChampions, err := LoadChampionList(chapionsIds)
		if err != nil {
			c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
			return
		}

		champions := make([]Champion, 0, 3)
		for _, champion := range loadChampions {
			champion.WinRate = champion.Winner[championID].WinRate
			champion.Losses = nil
			champion.WellWith = nil
			champion.Winner = nil
			champions = append(champions, champion)
		}

		c.Status(200).JSON(champions)
	})

	app.Listen(port)
}
