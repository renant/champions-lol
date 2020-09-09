package controllers

import (
	"context"
	"fmt"
	"sort"

	"github.com/gofiber/fiber"
	"github.com/renant/lol-api/database"
	"github.com/renant/lol-api/model"
)

func GetChampionById(c *fiber.Ctx) {
	championID := c.Params("championID")
	ctx := context.Background()
	champion := &model.Champion{}
	err := database.FirebaseDB.NewRef("/champions").Child(championID).Get(ctx, champion)
	if err != nil {
		fmt.Println(err)
		c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
		return
	}

	if champion.ID == "" {
		c.Status(404).JSON(map[string]string{"message": "Champion not found"})
		return
	}

	c.Status(200).JSON(champion)
}

func GetRecommendByChampionId(c *fiber.Ctx) {
	championID := c.Params("championID")
	ctx := context.Background()
	var data model.Champion
	err := database.FirebaseDB.NewRef("/champions").Child(championID).Get(ctx, &data)
	if err != nil {
		c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
	}

	if data.ID == "" {
		c.Status(404).JSON(map[string]string{"message": "Champion not found"})
		return
	}

	chapionsIds := make([]string, 0, len(data.Losses))
	for _, champion := range data.Losses {
		chapionsIds = append(chapionsIds, champion.ID)
	}

	loadChampions, err := model.LoadChampionList(chapionsIds)
	if err != nil {
		c.Status(500).JSON(map[string]string{"message": "Internal error to fetch data"})
		return
	}

	champions := make([]model.Champion, 0, len(loadChampions))
	for _, champion := range loadChampions {
		champion.WinRate = (data.Losses[champion.ID].WinRate - 100) * -1
		champion.Losses = nil
		champion.WellWith = nil
		champion.Winner = nil
		champions = append(champions, champion)
	}

	championsLosses := make([]model.Champion, 0, len(champions))
	for _, champion := range champions {
		championsLosses = append(championsLosses, champion)
	}

	sort.Slice(championsLosses, func(i, j int) bool {
		return championsLosses[i].WinRate > championsLosses[j].WinRate
	})

	c.Status(200).JSON(championsLosses[0:3])
}
