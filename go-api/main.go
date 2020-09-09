package main

import (
	"log"
	"os"

	"github.com/gofiber/cors"
	"github.com/gofiber/fiber"
	"github.com/gofiber/logger"
	"github.com/gofiber/recover"
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

	app.Use(cors.New())
	app.Use(logger.New())
	cfg := recover.Config{
		Handler: func(c *fiber.Ctx, err error) {
			c.Status(500).JSON(map[string]string{"message": err.Error()})
		},
	}
	app.Use(recover.New(cfg))

	port := "3000"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	app.Get("/", func(c *fiber.Ctx) {
		c.Send("Bora jogar lolzinho!")
	})

	app.Get("/champion/:championID", controllers.GetChampionById)
	app.Get("/recommend/:championID", controllers.GetRecommendByChampionId)

	app.Listen(port)
}
