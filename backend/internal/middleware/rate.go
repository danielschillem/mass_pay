package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"golang.org/x/net/context"

	"masspay-bf/internal/config"
)

// RateLimit implémente un sliding window counter via Redis.
// Chaque IP a droit à cfg.RateLimitPerMin requêtes par fenêtre de 1 min.
func RateLimit(rdb *redis.Client, cfg *config.Config) gin.HandlerFunc {
	if !cfg.RateLimitEnabled {
		return func(c *gin.Context) { c.Next() }
	}
	maxReqs := cfg.RateLimitPerMin
	window := 1 * time.Minute

	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = c.RemoteIP()
		}
		now := time.Now()
		windowKey := "rate:" + ip + ":" + strconv.FormatInt(now.Truncate(window).Unix(), 10)

		ctx := context.Background()
		count, err := rdb.Incr(ctx, windowKey).Result()
		if err != nil {
			c.Next()
			return
		}
		if count == 1 {
			rdb.Expire(ctx, windowKey, window)
		}

		if count > int64(maxReqs) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "trop de requêtes, réessayez dans quelques secondes",
			})
			return
		}
		c.Next()
	}
}
