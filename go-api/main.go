package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber"
	"github.com/joho/godotenv"
	"github.com/renant/lol-api/controllers"
	"github.com/renant/lol-api/database"
)

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Println("Error loading .env file")
	}

	database.Connect()

	app := fiber.New()

	port := "3000"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	app.Get("/", func(c *fiber.Ctx) {
		c.Send("Hello!")
	})

	app.Get("/champion/:championID", controllers.GetChampionById)
	app.Get("/recommend/:championID", controllers.GetRecommendByChampionId)

	app.Listen(port)
}
