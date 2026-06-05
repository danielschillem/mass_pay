package database

import (
	"log"

	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

func Connect(cfg *config.Config) *gorm.DB {
	logLevel := logger.Info
	if cfg.GinMode == "release" {
		logLevel = logger.Warn
	}

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("[db] connexion échouée : %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("[db] pool échoué : %v", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	log.Println("[db] PostgreSQL connecté")
	return db
}

func ConnectRedis(cfg *config.Config) *redis.Client {
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[redis] URL invalide : %v", err)
	}
	rdb := redis.NewClient(opt)
	log.Println("[redis] Redis connecté")
	return rdb
}

// Migrate exécute les migrations automatiques GORM.
// En production, préférer des migrations versionnées (golang-migrate).
func Migrate(db *gorm.DB) {
	// Activer l'extension uuid-ossp pour gen_random_uuid()
	db.Exec("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"")

	err := db.AutoMigrate(
		&models.Tenant{},
		&models.User{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.Beneficiary{},
		&models.Batch{},
		&models.BatchItem{},
	)
	if err != nil {
		log.Fatalf("[db] migration échouée : %v", err)
	}
	log.Println("[db] migrations appliquées")
}
