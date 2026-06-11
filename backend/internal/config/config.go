package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port    string
	GinMode string
	Env     string // dev, staging, prod

	DatabaseURL string
	RedisURL    string

	JWTSecret         string
	JWTSecretPrevious string // pour rotation de clé
	JWTExpiryHours    int
	RefreshExpiryDays int

	SeedSuperAdmin      bool
	SuperAdminEmail     string
	SuperAdminPassword  string
	SuperAdminFirstName string
	SuperAdminLastName  string

	RateLimitEnabled         bool
	RateLimitPerMin          int // requêtes par minute par IP (global, par IP)
	RateLimitLoginPerMin     int // tentatives de login par IP (défaut 10)
	RateLimitFinancialPerMin int // actions financières par tenant (défaut 5)

	// Chiffrement AES-256-GCM des champs sensibles (IFU, RCCM, téléphone)
	// Format : 64 caractères hexadécimaux — générer avec : openssl rand -hex 32
	FieldEncryptionKey string

	// 2FA TOTP obligatoire pour les actions financières (execute batch, recharge)
	TOTPRequired bool

	// Orange Money BF — CASHIN API
	// Réf. : "Contrat d'interface API OM : CASHIN"
	OrangeEnv               string // "test" | "production"
	OrangeTestURL           string // deprecated XML-RPC test URL
	OrangeProdURL           string // deprecated XML-RPC prod URL
	OrangeMerchantMSISDN    string // deprecated XML-RPC merchant MSISDN
	OrangeBeneficiaryMSISDN string // MSISDN bénéficiaire/compte Orange BF, si fourni
	OrangeUSSDMSISDN        string // MSISDN USSD Orange BF, si fourni
	OrangeAPIUsername       string // deprecated XML-RPC username
	OrangeAPIPassword       string // deprecated XML-RPC password
	OrangeProvider          string // deprecated XML-RPC value
	OrangePayID             string // deprecated XML-RPC value
	OrangeCashinTokenURL    string // endpoint GET API TOKEN fourni par OMBF
	OrangeCashinURL         string // endpoint CASHIN fourni par OMBF
	OrangeCashinAPIKey      string // header api-key fourni par OMBF
	OrangeCashinUsername    string // body USERNAME token
	OrangeCashinPassword    string // body PASSWORD token
	OrangeCashinAgentAlias  string // body msisdn : alias agent MynaPay fourni par OBF
	OrangeCashinAgentPIN    string // PIN agent, chiffré RSA avant envoi
	OrangePINPublicKey      string // clé publique RSA OMBF utilisée pour chiffrer le PIN
	// Certificats mTLS Orange BF optionnels si OMBF les impose au niveau réseau.
	OrangeCertPublic  string
	OrangeCertPrivate string

	// Moov Money BF — Online Merchant USSD Push (Huawei)
	// Réf. : "Online Merchant with USSD PUSH" & "Online Merchant Payment with OTP"
	//
	// UAT  : https://uat.moov-money.bf:38443
	// Prod : fournie par Moov Money à la mise en production
	//
	// Auth : HTTP Basic Auth — username/password fournis par Moov Money
	MoovEnv      string // "test" | "production"
	MoovTestURL  string // https://uat.moov-money.bf:38443
	MoovProdURL  string // URL production fournie par Moov à la mise en prod
	MoovUsername string // identifiant Basic Auth (ex: MYNAETOILE)
	MoovPassword string // mot de passe Basic Auth

	// Email transactionnel — SMTP ou API HTTPS (brevo/resend/log)
	MailProvider       string
	MailFromEmail      string
	MailFromName       string
	MailAPIURL         string
	MailAPIKey         string
	MailTimeoutSeconds int
	SMTPHost           string
	SMTPPort           int
	SMTPUsername       string
	SMTPPassword       string
	SMTPUseTLS         bool
	IMAPHost           string
	IMAPPort           int

	WorkerConcurrency int
	MaxRetries        int
	RetryDelaySeconds int

	DefaultCommissionRate float64
	ValidationThreshold   int64 // FCFA — double approbation au-dessus de ce seuil

	BackupPGDatabase string
	BackupPGUser     string
	BackupPGPassword string
	BackupPGS3Bucket string
	BackupPGS3Region string

	LogLevel string // debug, info, warn, error
}

func Load() *Config {
	_ = godotenv.Load()

	orangeAPIUsername := getEnv("ORANGE_MONEY_API_USERNAME", "")
	orangeAPIPassword := getEnv("ORANGE_MONEY_API_PASSWORD", "")
	orangeMerchantMSISDN := getEnv("ORANGE_MONEY_MERCHANT_MSISDN", "")

	return &Config{
		Port:    getEnv("PORT", "8080"),
		GinMode: getEnv("GIN_MODE", "debug"),

		DatabaseURL: mustGetEnv("DATABASE_URL"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),

		Env:               getEnv("ENV", "dev"),
		JWTSecret:         mustGetEnv("JWT_SECRET"),
		JWTSecretPrevious: getEnv("JWT_SECRET_PREVIOUS", ""),
		JWTExpiryHours:    getEnvInt("JWT_EXPIRY_HOURS", 24),
		RefreshExpiryDays: getEnvInt("REFRESH_EXPIRY_DAYS", 30),

		SeedSuperAdmin:      getEnvBool("SEED_SUPER_ADMIN", false),
		SuperAdminEmail:     getEnv("SUPER_ADMIN_EMAIL", ""),
		SuperAdminPassword:  getEnv("SUPER_ADMIN_PASSWORD", ""),
		SuperAdminFirstName: getEnv("SUPER_ADMIN_FIRST_NAME", "Super"),
		SuperAdminLastName:  getEnv("SUPER_ADMIN_LAST_NAME", "Admin"),

		RateLimitEnabled:         getEnv("RATE_LIMIT_ENABLED", "true") == "true",
		RateLimitPerMin:          getEnvInt("RATE_LIMIT_PER_MIN", 60),
		RateLimitLoginPerMin:     getEnvInt("RATE_LIMIT_LOGIN_PER_MIN", 10),
		RateLimitFinancialPerMin: getEnvInt("RATE_LIMIT_FINANCIAL_PER_MIN", 5),

		FieldEncryptionKey: getEnv("FIELD_ENCRYPTION_KEY", ""),
		TOTPRequired:       getEnvBool("TOTP_REQUIRED", false),

		OrangeEnv:               getEnv("ORANGE_MONEY_ENV", "test"),
		OrangeTestURL:           getEnv("ORANGE_MONEY_TEST_URL", "https://testom.orange.bf/"),
		OrangeProdURL:           getEnv("ORANGE_MONEY_PROD_URL", "https://apiom.orange.bf/"),
		OrangeMerchantMSISDN:    orangeMerchantMSISDN,
		OrangeBeneficiaryMSISDN: getEnv("ORANGE_MONEY_BENEFICIARY_MSISDN", ""),
		OrangeUSSDMSISDN:        getEnv("ORANGE_MONEY_USSD_MSISDN", ""),
		OrangeAPIUsername:       orangeAPIUsername,
		OrangeAPIPassword:       orangeAPIPassword,
		OrangeProvider:          getEnv("ORANGE_MONEY_PROVIDER", "101"),
		OrangePayID:             getEnv("ORANGE_MONEY_PAYID", "12"),
		OrangeCashinTokenURL:    getEnv("ORANGE_MONEY_CASHIN_TOKEN_URL", ""),
		OrangeCashinURL:         getEnv("ORANGE_MONEY_CASHIN_URL", ""),
		OrangeCashinAPIKey:      getEnv("ORANGE_MONEY_CASHIN_API_KEY", ""),
		OrangeCashinUsername:    getEnv("ORANGE_MONEY_CASHIN_USERNAME", orangeAPIUsername),
		OrangeCashinPassword:    getEnv("ORANGE_MONEY_CASHIN_PASSWORD", orangeAPIPassword),
		OrangeCashinAgentAlias:  getEnv("ORANGE_MONEY_AGENT_ALIAS", orangeMerchantMSISDN),
		OrangeCashinAgentPIN:    getEnv("ORANGE_MONEY_AGENT_PIN", ""),
		OrangePINPublicKey:      getEnv("ORANGE_MONEY_PIN_PUBLIC_KEY", ""),
		OrangeCertPublic:        getEnv("ORANGE_MONEY_CERT_PUBLIC", ""),
		OrangeCertPrivate:       getEnv("ORANGE_MONEY_CERT_PRIVATE", ""),

		MoovEnv:      getEnv("MOOV_ENV", "test"),
		MoovTestURL:  getEnv("MOOV_TEST_URL", "https://uat.moov-money.bf:38443"),
		MoovProdURL:  getEnv("MOOV_PROD_URL", ""),
		MoovUsername: getEnv("MOOV_USERNAME", ""),
		MoovPassword: getEnv("MOOV_PASSWORD", ""),

		MailProvider:       getEnv("MAIL_PROVIDER", "smtp"),
		MailFromEmail:      getEnv("MAIL_FROM_EMAIL", ""),
		MailFromName:       getEnv("MAIL_FROM_NAME", "MynaPay"),
		MailAPIURL:         getEnv("MAIL_API_URL", ""),
		MailAPIKey:         getEnv("MAIL_API_KEY", ""),
		MailTimeoutSeconds: getEnvInt("MAIL_TIMEOUT_SECONDS", 10),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           getEnvInt("SMTP_PORT", 465),
		SMTPUsername:       getEnv("SMTP_USERNAME", ""),
		SMTPPassword:       getEnv("SMTP_PASSWORD", ""),
		SMTPUseTLS:         getEnvBool("SMTP_USE_TLS", true),
		IMAPHost:           getEnv("IMAP_HOST", ""),
		IMAPPort:           getEnvInt("IMAP_PORT", 993),

		WorkerConcurrency: getEnvInt("WORKER_CONCURRENCY", 5),
		MaxRetries:        getEnvInt("MAX_RETRIES", 3),
		RetryDelaySeconds: getEnvInt("RETRY_DELAY_SECONDS", 30),

		DefaultCommissionRate: getEnvFloat("DEFAULT_COMMISSION_RATE", 0.015),
		ValidationThreshold:   int64(getEnvInt("VALIDATION_THRESHOLD", 500000)),

		BackupPGDatabase: getEnv("BACKUP_PG_DATABASE", "masspay_bf"),
		BackupPGUser:     getEnv("BACKUP_PG_USER", "masspay"),
		BackupPGPassword: getEnv("BACKUP_PG_PASSWORD", ""),
		BackupPGS3Bucket: getEnv("BACKUP_S3_BUCKET", ""),
		BackupPGS3Region: getEnv("BACKUP_S3_REGION", "eu-west-3"),

		LogLevel: getEnv("LOG_LEVEL", "info"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("[config] variable requise non définie : %s", key)
	}
	return v
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}

func getEnvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func getEnvFloat(key string, fallback float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}
