package middleware

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"masspay-bf/internal/config"
)

// RateLimit implémente un sliding window counter via Redis (global par IP).
func RateLimit(rdb *redis.Client, cfg *config.Config) gin.HandlerFunc {
	if !cfg.RateLimitEnabled {
		return func(c *gin.Context) { c.Next() }
	}
	return rateLimitByKey(rdb, cfg.RateLimitPerMin, "ip", func(c *gin.Context) string {
		ip := c.ClientIP()
		if ip == "" {
			ip = c.RemoteIP()
		}
		return ip
	})
}

// RateLimitStrict limite les requêtes par IP sur un endpoint nommé (ex: "login").
// Plus restrictif que RateLimit global — utilisé sur les endpoints sensibles.
func RateLimitStrict(rdb *redis.Client, maxPerMin int, endpointName string) gin.HandlerFunc {
	return rateLimitByKey(rdb, maxPerMin, "strict:"+endpointName, func(c *gin.Context) string {
		ip := c.ClientIP()
		if ip == "" {
			ip = c.RemoteIP()
		}
		return ip
	})
}

// RateLimitTenant limite les requêtes par tenant ID sur un endpoint nommé.
// Doit être appelé après Auth + RequireActiveUser (tenant ID disponible dans le contexte).
func RateLimitTenant(rdb *redis.Client, maxPerMin int, endpointName string) gin.HandlerFunc {
	return rateLimitByKey(rdb, maxPerMin, "tenant:"+endpointName, func(c *gin.Context) string {
		tenantID := GetCallerTenantID(c)
		if tenantID == nil {
			// Super admin — utiliser l'user ID comme clé de rate limit
			return GetCallerID(c).String()
		}
		return tenantID.String()
	})
}

// rateLimitByKey est la fonction générique de sliding window counter.
func rateLimitByKey(rdb *redis.Client, maxPerMin int, prefix string, keyFn func(*gin.Context) string) gin.HandlerFunc {
	window := 1 * time.Minute
	return func(c *gin.Context) {
		if rdb == nil || maxPerMin <= 0 {
			c.Next()
			return
		}
		key := keyFn(c)
		if key == "" {
			c.Next()
			return
		}
		now := time.Now()
		redisKey := "rate:" + prefix + ":" + key + ":" + strconv.FormatInt(now.Truncate(window).Unix(), 10)

		ctx := context.Background()
		count, err := rdb.Incr(ctx, redisKey).Result()
		if err != nil {
			c.Next()
			return
		}
		if count == 1 {
			rdb.Expire(ctx, redisKey, window+5*time.Second)
		}

		if count > int64(maxPerMin) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "trop de requêtes — réessayez dans quelques secondes",
			})
			return
		}
		c.Next()
	}
}
