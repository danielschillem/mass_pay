package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/handlers"
	"masspay-bf/internal/mail"
	"masspay-bf/internal/middleware"
	"masspay-bf/internal/models"
)

func Setup(db *gorm.DB, rdb *redis.Client, cfg *config.Config, workerFn handlers.WorkerStatusFunc) *gin.Engine {
	gin.SetMode(cfg.GinMode)

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	// Rate limiting global par IP
	r.Use(middleware.RateLimit(rdb, cfg))

	// Security headers
	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Next()
	})

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-TOTP-Code")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	monitoring := handlers.NewMonitoringHandler(db, rdb, cfg, workerFn)
	r.GET("/health", monitoring.Health)

	authH := handlers.NewAuthHandler(db, cfg, rdb)
	adminH := handlers.NewAdminHandler(db, cfg)
	tenantH := handlers.NewTenantHandler(db, rdb, cfg)
	mailH := handlers.NewMailHandler(mail.NewSender(cfg))

	api := r.Group("/api/v1")

	// ── Auth (public) ─────────────────────────────────────────────
	auth := api.Group("/auth")
	{
		// Login : rate limit strict 10/min par IP pour limiter les brute force
		auth.POST("/login",
			middleware.RateLimitStrict(rdb, cfg.RateLimitLoginPerMin, "login"),
			authH.Login,
		)
		auth.POST("/refresh",
			middleware.RateLimitStrict(rdb, cfg.RateLimitLoginPerMin, "refresh"),
			authH.RefreshToken,
		)
		auth.POST("/logout", middleware.Auth(cfg, rdb), authH.Logout)
		auth.GET("/me", middleware.Auth(cfg, rdb), authH.Me)

		// 2FA TOTP — configuration de l'authentification à deux facteurs
		twoFA := auth.Group("/2fa")
		twoFA.Use(middleware.Auth(cfg, rdb), middleware.RequireActiveUser(db))
		{
			twoFA.POST("/setup", authH.Setup2FA)
			twoFA.POST("/confirm", authH.Confirm2FA)
			twoFA.DELETE("", authH.Disable2FA)
		}
	}

	// ── Super Admin ───────────────────────────────────────────────
	admin := api.Group("/admin")
	admin.Use(middleware.Auth(cfg, rdb), middleware.RequireActiveUser(db), middleware.RequireSuperAdmin())
	{
		admin.GET("/stats", adminH.GlobalStatsV2)
		admin.GET("/mail/status", mailH.Status)
		admin.POST("/mail/test", mailH.SendTest)

		tenants := admin.Group("/tenants")
		{
			tenants.GET("", adminH.ListTenants)
			tenants.POST("", adminH.CreateTenant)
			tenants.GET("/:tenantId", adminH.GetTenant)
			tenants.PATCH("/:tenantId", adminH.UpdateTenant)
			tenants.PATCH("/:tenantId/activate", adminH.ActivateTenant)
			tenants.PATCH("/:tenantId/suspend", adminH.SuspendTenant)
			// Recharge wallet : action financière — 2FA + rate limit strict
			tenants.POST("/:tenantId/wallet/recharge",
				middleware.Require2FA(cfg, rdb),
				middleware.RateLimitStrict(rdb, cfg.RateLimitFinancialPerMin, "admin-recharge"),
				adminH.RechargeWallet,
			)
			tenants.GET("/:tenantId/wallet/transactions", adminH.ListTenantWalletTransactions)

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

		admins := admin.Group("/admins")
		{
			admins.GET("", adminH.ListAdminUsers)
			admins.POST("", adminH.CreateAdminUser)
			admins.PATCH("/:userId", adminH.UpdateAdminUser)
			admins.DELETE("/:userId", adminH.DeleteAdminUser)
		}
	}

	// ── Tenant (self-service) ─────────────────────────────────────
	tenant := api.Group("/tenant")
	tenant.Use(
		middleware.Auth(cfg, rdb),
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
			// Execute batch : action financière critique — 2FA requis + rate limit par tenant
			batches.POST("/:batchId/execute",
				middleware.RequirePermission(middleware.PermBatchExecute),
				middleware.Require2FA(cfg, rdb),
				middleware.RateLimitTenant(rdb, cfg.RateLimitFinancialPerMin, "batch-execute"),
				tenantH.ExecuteBatch,
			)
		}

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

		tenant.GET("/wallet/transactions", tenantH.ListWalletTransactions)

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
