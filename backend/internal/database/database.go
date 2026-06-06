package database

import (
	"errors"
	"strings"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

func Connect(cfg *config.Config, log *logrus.Logger) *gorm.DB {
	logLevel := logger.Info
	if cfg.GinMode == "release" {
		logLevel = logger.Warn
	}

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("connexion PostgreSQL échouée: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("pool PostgreSQL échoué: %v", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	log.Info("PostgreSQL connecté")
	return db
}

func ConnectRedis(cfg *config.Config, log *logrus.Logger) *redis.Client {
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("URL Redis invalide: %v", err)
	}
	rdb := redis.NewClient(opt)
	log.Info("Redis connecté")
	return rdb
}

// Migrate exécute les migrations automatiques GORM.
// En production, préférer des migrations versionnées (golang-migrate).
func Migrate(db *gorm.DB, log *logrus.Logger) {
	// Activer l'extension pgcrypto pour gen_random_uuid()
	db.Exec("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"")

	err := db.AutoMigrate(
		&models.Tenant{},
		&models.User{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.Beneficiary{},
		&models.Batch{},
		&models.BatchItem{},
		&models.KYBDocument{},
		&models.KYBComment{},
		&models.KYBHistory{},
		&models.RefreshToken{},
	)
	if err != nil {
		log.Fatalf("migration échouée: %v", err)
	}
	log.Info("migrations appliquées")
}

func SeedSuperAdmin(db *gorm.DB, cfg *config.Config, log *logrus.Logger) {
	if !cfg.SeedSuperAdmin {
		return
	}

	email := strings.ToLower(strings.TrimSpace(cfg.SuperAdminEmail))
	password := strings.TrimSpace(cfg.SuperAdminPassword)
	firstName := strings.TrimSpace(cfg.SuperAdminFirstName)
	lastName := strings.TrimSpace(cfg.SuperAdminLastName)

	if email == "" || password == "" {
		log.Warn("seed super_admin ignoré: SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD sont requis")
		return
	}
	if len(password) < 8 {
		log.Warn("seed super_admin ignoré: SUPER_ADMIN_PASSWORD doit contenir au moins 8 caractères")
		return
	}
	if firstName == "" {
		firstName = "Super"
	}
	if lastName == "" {
		lastName = "Admin"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("seed super_admin: hash password échoué: %v", err)
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		err := tx.Unscoped().Where("email = ?", email).First(&user).Error
		if err == nil {
			updates := map[string]interface{}{
				"tenant_id":     nil,
				"email":         email,
				"password_hash": string(hash),
				"first_name":    firstName,
				"last_name":     lastName,
				"role":          models.RoleSuperAdmin,
				"is_active":     true,
				"deleted_at":    nil,
			}
			return tx.Unscoped().Model(&user).Updates(updates).Error
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		user = models.User{
			Email:        email,
			PasswordHash: string(hash),
			FirstName:    firstName,
			LastName:     lastName,
			Role:         models.RoleSuperAdmin,
			IsActive:     true,
		}
		return tx.Create(&user).Error
	})
	if err != nil {
		log.Fatalf("seed super_admin échoué: %v", err)
	}

	log.WithField("email", email).Info("seed super_admin appliqué")
}
