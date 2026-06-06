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

func Setup(db *gorm.DB, rdb *redis.Client, cfg *config.Config, workerFn handlers.WorkerStatusFunc) *gin.Engine {
	gin.SetMode(cfg.GinMode)

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	// Rate limiting global
	r.Use(middleware.RateLimit(rdb, cfg))

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

	// Monitoring — accessible sans auth
	monitoring := handlers.NewMonitoringHandler(db, rdb, cfg, workerFn)
	r.GET("/health", monitoring.Health)

	authH := handlers.NewAuthHandler(db, cfg)
	adminH := handlers.NewAdminHandler(db, cfg)
	tenantH := handlers.NewTenantHandler(db, rdb, cfg)

	api := r.Group("/api/v1")

	// ── Auth (public) ─────────────────────────────────────────────
	auth := api.Group("/auth")
	{
		auth.POST("/login", authH.Login)
		auth.POST("/refresh", authH.RefreshToken)
		auth.POST("/logout", middleware.Auth(cfg), authH.Logout)
		auth.GET("/me", middleware.Auth(cfg), authH.Me)
	}

	// ── Super Admin ───────────────────────────────────────────────
	admin := api.Group("/admin")
	admin.Use(middleware.Auth(cfg), middleware.RequireActiveUser(db), middleware.RequireSuperAdmin())
	{
		admin.GET("/stats", adminH.GlobalStatsV2)

		tenants := admin.Group("/tenants")
		{
			tenants.GET("", adminH.ListTenants)
			tenants.POST("", adminH.CreateTenant)
			tenants.GET("/:tenantId", adminH.GetTenant)
			tenants.PATCH("/:tenantId", adminH.UpdateTenant)
			tenants.PATCH("/:tenantId/activate", adminH.ActivateTenant)
			tenants.PATCH("/:tenantId/suspend", adminH.SuspendTenant)
			tenants.POST("/:tenantId/wallet/recharge", adminH.RechargeWallet)
			tenants.GET("/:tenantId/wallet/transactions", adminH.ListTenantWalletTransactions)

			// Utilisateurs d'un tenant (vue admin)
			tenantUsers := tenants.Group("/:tenantId/users")
			{
				tenantUsers.GET("", adminH.ListTenantUsers)
				tenantUsers.POST("", adminH.CreateTenantUser)
				tenantUsers.PATCH("/:userId", adminH.UpdateTenantUser)
				tenantUsers.DELETE("/:userId", adminH.DeleteTenantUser)
			}

			kyb := tenants.Group("/:tenantId/kyb")
			{
				kyb.GET("/documents", adminH.ListKYBDocuments)
				kyb.POST("/documents", adminH.UploadKYBDocument)
				kyb.PATCH("/documents/:docId/review", adminH.ReviewKYBDocument)
				kyb.GET("/comments", adminH.ListKYBComments)
				kyb.POST("/comments", adminH.AddKYBComment)
				kyb.GET("/history", adminH.GetKYBHistory)
				kyb.POST("/reject", adminH.RejectKYB)
			}
		}

		// Gestion des super admins
		admins := admin.Group("/admins")
		{
			admins.GET("", adminH.ListAdminUsers)
			admins.POST("", adminH.CreateAdminUser)
			admins.PATCH("/:userId", adminH.UpdateAdminUser)
			admins.DELETE("/:userId", adminH.DeleteAdminUser)
		}
	}

	// ── Tenant (self-service) ─────────────────────────────────────
	// Routes accessibles via le token tenant — le tenantId est implicite.
	// Un super_admin peut passer un :tenantId explicite pour agir en tant que.
	tenant := api.Group("/tenant")
	tenant.Use(
		middleware.Auth(cfg),
		middleware.RequireActiveUser(db),
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
				middleware.RequirePermission(middleware.PermBatchCreate),
				tenantH.CreateBatch,
			)
			batches.GET("/:batchId", tenantH.GetBatch)
			batches.POST("/:batchId/validate",
				middleware.RequirePermission(middleware.PermBatchValidate),
				tenantH.ValidateBatch,
			)
			batches.POST("/:batchId/execute",
				middleware.RequirePermission(middleware.PermBatchExecute),
				tenantH.ExecuteBatch,
			)
		}

		// Bénéficiaires
		benef := tenant.Group("/beneficiaries")
		{
			benef.GET("", tenantH.ListBeneficiaries)
			benef.POST("",
				middleware.RequirePermission(middleware.PermBeneficiaryWrite),
				tenantH.CreateBeneficiary,
			)
			benef.PATCH("/:beneficiaryId",
				middleware.RequirePermission(middleware.PermBeneficiaryWrite),
				tenantH.UpdateBeneficiary,
			)
			benef.DELETE("/:beneficiaryId",
				middleware.RequirePermission(middleware.PermBeneficiaryDelete),
				tenantH.DeleteBeneficiary,
			)
		}

		// Transactions wallet
		tenant.GET("/wallet/transactions", tenantH.ListWalletTransactions)

		// Gestion équipe
		users := tenant.Group("/users")
		{
			users.GET("", tenantH.ListUsers)
			users.POST("",
				middleware.RequirePermission(middleware.PermTenantUserWrite),
				tenantH.CreateUser,
			)
			users.PATCH("/:userId",
				middleware.RequirePermission(middleware.PermTenantUserWrite),
				tenantH.UpdateUser,
			)
			users.DELETE("/:userId",
				middleware.RequirePermission(middleware.PermTenantUserDelete),
				tenantH.DeleteUser,
			)
		}
	}

	return r
}
