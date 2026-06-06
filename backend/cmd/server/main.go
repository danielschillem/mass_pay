package main

import (
	"os"

	"masspay-bf/internal/config"
	"masspay-bf/internal/database"
	"masspay-bf/internal/routes"
	"masspay-bf/internal/workers"

	"github.com/sirupsen/logrus"
)

func main() {
	cfg := config.Load()

	// Logger structuré
	log := logrus.New()
	log.SetFormatter(&logrus.JSONFormatter{
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyTime:  "@timestamp",
			logrus.FieldKeyLevel: "level",
			logrus.FieldKeyMsg:   "message",
		},
	})
	log.SetOutput(os.Stdout)

	level, err := logrus.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = logrus.InfoLevel
	}
	log.SetLevel(level)

	log.WithField("env", cfg.Env).Info("démarrage MynaPay BF")

	db := database.Connect(cfg, log)
	rdb := database.ConnectRedis(cfg, log)

	database.Migrate(db, log)
	database.SeedSuperAdmin(db, cfg, log)

	// Worker de virement — goroutine dédiée
	workerStatus := workers.Start(db, rdb, cfg, log)

	// Serveur HTTP
	r := routes.Setup(db, rdb, cfg, workerStatus)

	log.WithField("port", cfg.Port).Info("serveur HTTP démarré")
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("erreur fatale: %v", err)
	}
}
