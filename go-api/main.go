package main

import (
	"context"
	"fmt"
	"log"

	firebase "firebase.google.com/go"
	"github.com/gofiber/fiber"
)

func main() {
	app := fiber.New()

	projectID := "champions-lol"
	config := &firebase.Config{
		ProjectID:   projectID,
		DatabaseURL: "https://" + projectID + ".firebaseio.com",
	}
	ctx := context.Background()
	fbApp, err := firebase.NewApp(ctx, config)
	if err != nil {
		log.Fatalf("error initializing app: %v\n", err)
	}

	db, err := fbApp.Database(ctx)
	if err != nil {
		log.Fatalln("Error initializing database client:", err)
	}

	app.Get("/", func(c *fiber.Ctx) {
		c.Send("Hello!")
	})

	app.Get("/champion/:championID", func(c *fiber.Ctx) {
		championID := c.Params("championID")
		ctx := context.Background()
		var data map[string]interface{}
		err := db.NewRef("/champions").Child(championID).Get(ctx, &data)
		if err != nil {
			c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
		}

		fmt.Println(data)
		c.Status(200).JSON(data)
	})

	app.Listen(3000)
}
