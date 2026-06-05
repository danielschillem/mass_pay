package main

import (
	"log"

	"masspay-bf/internal/config"
	"masspay-bf/internal/database"
	"masspay-bf/internal/routes"
	"masspay-bf/internal/workers"
)

func main() {
	cfg := config.Load()

	db  := database.Connect(cfg)
	rdb := database.ConnectRedis(cfg)

	database.Migrate(db)

	// Worker de virement — goroutine dédiée
	go workers.Start(db, rdb, cfg)

	// Serveur HTTP
	r := routes.Setup(db, rdb, cfg)

	log.Printf("[server] MynaPay BF démarré sur :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("[server] erreur fatale: %v", err)
	}
}
