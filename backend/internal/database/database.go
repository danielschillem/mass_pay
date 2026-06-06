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
	"masspay-bf/internal/crypto"
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

	// ── Pré-migration : changements que AutoMigrate ne gère pas ──────
	//
	// 1. Agrandir les colonnes chiffrées (AES-256-GCM produit ~500 chars base64)
	//    avant AutoMigrate pour éviter une troncature silencieuse.
	// 2. Supprimer les anciens index uniques portés sur les valeurs en clair ;
	//    les nouveaux index (ifu_hash, idx_tenant_phone_hash) seront recréés par AutoMigrate.
	preMigrations := []string{
		// Tenant — IFU et RCCM
		`ALTER TABLE tenants ALTER COLUMN ifu TYPE varchar(500)`,
		`ALTER TABLE tenants ALTER COLUMN rccm TYPE varchar(500)`,
		`DROP INDEX IF EXISTS idx_tenants_ifu`,

		// Beneficiary — phone_number
		`ALTER TABLE beneficiaries ALTER COLUMN phone_number TYPE varchar(500)`,
		`DROP INDEX IF EXISTS idx_tenant_phone`,
	}
	for _, sql := range preMigrations {
		if err := db.Exec(sql).Error; err != nil {
			// Les erreurs "column does not exist" ou "index does not exist" sont normales
			// sur une base fraîche — on les ignore.
			log.Debugf("pré-migration (ignorée si base fraîche) : %s — %v", sql, err)
		}
	}

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

// EncryptExistingData chiffre les champs sensibles existants encore en clair.
// Idempotent : les valeurs déjà chiffrées (base64 valide décodable par la clé) sont ignorées.
// À appeler après Migrate(), uniquement si la clé de chiffrement est configurée.
func EncryptExistingData(db *gorm.DB, log *logrus.Logger) {
	// ── Tenants ──────────────────────────────────────────────────────
	var tenants []struct {
		ID   string
		IFU  string
		RCCM string
	}
	db.Raw("SELECT id, ifu, rccm FROM tenants").Scan(&tenants)
	for _, t := range tenants {
		encIFU := crypto.EncryptField(t.IFU)
		encRCCM := crypto.EncryptField(t.RCCM)
		hashIFU := crypto.HashField(t.IFU)
		if err := db.Exec(
			"UPDATE tenants SET ifu = ?, rccm = ?, ifu_hash = ? WHERE id = ? AND (ifu_hash IS NULL OR ifu_hash = '')",
			encIFU, encRCCM, hashIFU, t.ID,
		).Error; err != nil {
			log.Warnf("encrypt tenant %s : %v", t.ID, err)
		}
	}

	// ── Beneficiaries ─────────────────────────────────────────────────
	var beneficiaries []struct {
		ID          string
		PhoneNumber string
	}
	db.Raw("SELECT id, phone_number FROM beneficiaries").Scan(&beneficiaries)
	for _, b := range beneficiaries {
		encPhone := crypto.EncryptField(b.PhoneNumber)
		hashPhone := crypto.HashField(b.PhoneNumber)
		if err := db.Exec(
			"UPDATE beneficiaries SET phone_number = ?, phone_hash = ? WHERE id = ? AND (phone_hash IS NULL OR phone_hash = '')",
			encPhone, hashPhone, b.ID,
		).Error; err != nil {
			log.Warnf("encrypt beneficiary %s : %v", b.ID, err)
		}
	}

	log.Info("migration chiffrement données existantes terminée")
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
