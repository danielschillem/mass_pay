package handlers

import (
	"context"
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
)

type MonitoringHandler struct {
	db     *gorm.DB
	rdb    *redis.Client
	cfg    *config.Config
	start  time.Time
	worker WorkerStatusFunc
}

type WorkerStatusFunc func() map[string]interface{}

func NewMonitoringHandler(db *gorm.DB, rdb *redis.Client, cfg *config.Config, wf WorkerStatusFunc) *MonitoringHandler {
	return &MonitoringHandler{
		db:     db,
		rdb:    rdb,
		cfg:    cfg,
		start:  time.Now(),
		worker: wf,
	}
}

// Health retourne l'état de santé complet de la plateforme.
func (h *MonitoringHandler) Health(c *gin.Context) {
	ctx := context.Background()

	// PostgreSQL
	dbOK := true
	dbErr := ""
	sqlDB, err := h.db.DB()
	if err != nil {
		dbOK = false
		dbErr = err.Error()
	} else if err := sqlDB.PingContext(ctx); err != nil {
		dbOK = false
		dbErr = err.Error()
	}

	// Redis
	redisOK := true
	redisErr := ""
	if _, err := h.rdb.Ping(ctx).Result(); err != nil {
		redisOK = false
		redisErr = err.Error()
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	status := http.StatusOK
	if !dbOK || !redisOK {
		status = http.StatusServiceUnavailable
	}

	workerStatus := map[string]interface{}{"status": "unknown"}
	if h.worker != nil {
		workerStatus = h.worker()
	}

	c.JSON(status, gin.H{
		"status":    "ok",
		"service":   "MynaPay BF",
		"env":       h.cfg.Env,
		"uptime":    time.Since(h.start).String(),
		"version":   "2.0.0",
		"goroutines": runtime.NumGoroutine(),
		"memory_mb": memStats.Alloc / 1024 / 1024,
		"checks": gin.H{
			"postgresql": gin.H{
				"status": dbStatus(dbOK),
				"error":  dbErr,
			},
			"redis": gin.H{
				"status": dbStatus(redisOK),
				"error":  redisErr,
			},
			"worker": workerStatus,
		},
	})
}

func dbStatus(ok bool) string {
	if ok {
		return "up"
	}
	return "down"
}
