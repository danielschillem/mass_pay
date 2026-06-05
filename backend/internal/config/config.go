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

	DatabaseURL string
	RedisURL    string

	JWTSecret        string
	JWTExpiryHours   int
	RefreshExpiryDays int

	OrangeBaseURL   string
	OrangeAPIKey    string
	OrangeAccountID string
	OrangePIN       string

	MoovBaseURL     string
	MoovAPIKey      string
	MoovAccountID   string

	WorkerConcurrency  int
	MaxRetries         int
	RetryDelaySeconds  int

	DefaultCommissionRate float64
	ValidationThreshold   int64 // FCFA — double approbation au-dessus de ce seuil
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:    getEnv("PORT", "8080"),
		GinMode: getEnv("GIN_MODE", "debug"),

		DatabaseURL: mustGetEnv("DATABASE_URL"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),

		JWTSecret:         mustGetEnv("JWT_SECRET"),
		JWTExpiryHours:    getEnvInt("JWT_EXPIRY_HOURS", 24),
		RefreshExpiryDays: getEnvInt("REFRESH_EXPIRY_DAYS", 30),

		OrangeBaseURL:   getEnv("ORANGE_BASE_URL", "https://api.orange.com/orange-money-webpay/bf/v1"),
		OrangeAPIKey:    getEnv("ORANGE_API_KEY", ""),
		OrangeAccountID: getEnv("ORANGE_ACCOUNT_ID", ""),
		OrangePIN:       getEnv("ORANGE_PIN", ""),

		MoovBaseURL:     getEnv("MOOV_BASE_URL", "https://openapi.moov.africa/bf/v1"),
		MoovAPIKey:      getEnv("MOOV_API_KEY", ""),
		MoovAccountID:   getEnv("MOOV_ACCOUNT_ID", ""),

		WorkerConcurrency: getEnvInt("WORKER_CONCURRENCY", 5),
		MaxRetries:        getEnvInt("MAX_RETRIES", 3),
		RetryDelaySeconds: getEnvInt("RETRY_DELAY_SECONDS", 30),

		DefaultCommissionRate: getEnvFloat("DEFAULT_COMMISSION_RATE", 0.015),
		ValidationThreshold:   int64(getEnvInt("VALIDATION_THRESHOLD", 500000)),
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
