package main

import (
	"os"

	"masspay-bf/internal/config"
	"masspay-bf/internal/crypto"
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

	// Initialiser la clé de chiffrement AES-256 pour les champs sensibles
	if cfg.FieldEncryptionKey != "" {
		key, err := crypto.DecodeHexKey(cfg.FieldEncryptionKey)
		if err != nil {
			log.Fatalf("FIELD_ENCRYPTION_KEY invalide : %v", err)
		}
		crypto.SetDefaultKey(key)
		log.Info("chiffrement des champs sensibles activé (AES-256-GCM)")
	} else if cfg.Env == "staging" || cfg.Env == "prod" || cfg.Env == "production" {
		log.Fatal("FIELD_ENCRYPTION_KEY est obligatoire en staging/production")
	} else {
		log.Warn("FIELD_ENCRYPTION_KEY non définie — chiffrement des champs désactivé (mode dev)")
	}

	db := database.Connect(cfg, log)
	rdb := database.ConnectRedis(cfg, log)

	database.Migrate(db, log)
	if crypto.IsKeySet() {
		database.EncryptExistingData(db, log)
	}
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
