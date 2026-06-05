package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/handlers"
	"masspay-bf/internal/middleware"
	"masspay-bf/internal/models"
)

func Setup(db *gorm.DB, rdb *redis.Client, cfg *config.Config) *gin.Engine {
	gin.SetMode(cfg.GinMode)

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	// CORS minimal — adapter selon les besoins prod
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Healthcheck
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "MassPay BF"})
	})

	authH   := handlers.NewAuthHandler(db, cfg)
	adminH  := handlers.NewAdminHandler(db, cfg)
	tenantH := handlers.NewTenantHandler(db, rdb, cfg)

	api := r.Group("/api/v1")

	// ── Auth (public) ─────────────────────────────────────────────
	auth := api.Group("/auth")
	{
		auth.POST("/login", authH.Login)
		auth.GET("/me", middleware.Auth(cfg), authH.Me)
	}

	// ── Super Admin ───────────────────────────────────────────────
	admin := api.Group("/admin")
	admin.Use(middleware.Auth(cfg), middleware.RequireSuperAdmin())
	{
		admin.GET("/stats", adminH.GlobalStats)

		tenants := admin.Group("/tenants")
		{
			tenants.GET("", adminH.ListTenants)
			tenants.POST("", adminH.CreateTenant)
			tenants.PATCH("/:tenantId/activate", adminH.ActivateTenant)
			tenants.PATCH("/:tenantId/suspend", adminH.SuspendTenant)
		}
	}

	// ── Tenant (self-service) ─────────────────────────────────────
	// Routes accessibles via le token tenant — le tenantId est implicite.
	// Un super_admin peut passer un :tenantId explicite pour agir en tant que.
	tenant := api.Group("/tenant")
	tenant.Use(
		middleware.Auth(cfg),
		middleware.RequireRole(
			models.RoleSuperAdmin,
			models.RoleTenantAdmin,
			models.RoleTenantManager,
			models.RoleTenantAuditor,
		),
		middleware.TenantGuard(db),
	)
	{
		tenant.GET("/dashboard", tenantH.Dashboard)
		tenant.GET("/wallet", tenantH.GetWallet)

		// Batchs
		batches := tenant.Group("/batches")
		{
			batches.GET("", tenantH.ListBatches)
			batches.POST("",
				middleware.RequireRole(models.RoleSuperAdmin, models.RoleTenantAdmin, models.RoleTenantManager),
				tenantH.CreateBatch,
			)
			batches.GET("/:batchId", tenantH.GetBatch)
			batches.POST("/:batchId/validate",
				middleware.RequireRole(models.RoleSuperAdmin, models.RoleTenantAdmin),
				tenantH.ValidateBatch,
			)
			batches.POST("/:batchId/execute",
				middleware.RequireRole(models.RoleSuperAdmin, models.RoleTenantAdmin),
				tenantH.ExecuteBatch,
			)
		}

		// Bénéficiaires
		benef := tenant.Group("/beneficiaries")
		{
			benef.GET("", tenantH.ListBeneficiaries)
			benef.POST("",
				middleware.RequireRole(models.RoleSuperAdmin, models.RoleTenantAdmin, models.RoleTenantManager),
				tenantH.CreateBeneficiary,
			)
			benef.DELETE("/:beneficiaryId",
				middleware.RequireRole(models.RoleSuperAdmin, models.RoleTenantAdmin),
				tenantH.DeleteBeneficiary,
			)
		}
	}

	return r
}
