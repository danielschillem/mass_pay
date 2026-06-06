package handlers

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/crypto"
	"masspay-bf/internal/middleware"
	"masspay-bf/internal/models"
	"masspay-bf/internal/services"
)

// ── Slug helpers ─────────────────────────────────────────────────

var (
	slugNonAlnum   = regexp.MustCompile(`[^a-z0-9]+`)
	slugTrim       = regexp.MustCompile(`^-+|-+$`)
	fileNameUnsafe = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
)

const maxKYBUploadSize = 10 * 1024 * 1024

// slugify converts a string like "Société ABC & Co." → "societe-abc-co"
func slugify(s string) string {
	// Strip accents: NFD decompose, then drop non-spacing marks
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	result, _, _ := transform.String(t, s)
	result = strings.ToLower(result)
	result = slugNonAlnum.ReplaceAllString(result, "-")
	result = slugTrim.ReplaceAllString(result, "")
	if result == "" {
		result = "tenant"
	}
	return result
}

// uniqueSlug generates a slug from raison_sociale and appends -2, -3 … until no DB collision.
func uniqueSlug(db *gorm.DB, raison string) string {
	base := slugify(raison)
	slug := base
	for i := 2; ; i++ {
		var count int64
		db.Model(&models.Tenant{}).Where("slug = ?", slug).Count(&count)
		if count == 0 {
			return slug
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
}

// ── Auth ──────────────────────────────────────────────────────────

type AuthHandler struct {
	db  *gorm.DB
	cfg *config.Config
	rdb *redis.Client
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config, rdb *redis.Client) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg, rdb: rdb}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = normalizeEmail(req.Email)

	var user models.User
	if err := h.db.Where("email = ? AND deleted_at IS NULL", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "identifiants invalides"})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "compte désactivé"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "identifiants invalides"})
		return
	}

	accessToken, err := middleware.GenerateAccessToken(h.cfg, &user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération token échouée"})
		return
	}

	// Générer le refresh token
	rawRefresh, hashedRefresh, err := models.GenerateRefreshToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération refresh token échouée"})
		return
	}

	refreshExpiry := time.Now().Add(time.Duration(h.cfg.RefreshExpiryDays) * 24 * time.Hour)
	refreshToken := models.RefreshToken{
		UserID:    user.ID,
		TokenHash: hashedRefresh,
		ExpiresAt: refreshExpiry,
		UserAgent: c.GetHeader("User-Agent"),
		IPAddress: c.ClientIP(),
	}
	if err := h.db.Create(&refreshToken).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sauvegarde refresh token échouée"})
		return
	}

	now := time.Now()
	h.db.Model(&user).Update("last_login_at", now)

	// Charger le nom du tenant si l'utilisateur en a un
	tenantName := ""
	if user.TenantID != nil {
		var tenant models.Tenant
		if err := h.db.Select("raison_sociale").First(&tenant, "id = ?", *user.TenantID).Error; err == nil {
			tenantName = tenant.RaisonSociale
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": rawRefresh,
		"expires_in":    h.cfg.JWTExpiryHours * 3600,
		"user": gin.H{
			"id":           user.ID,
			"email":        user.Email,
			"full_name":    user.FullName(),
			"role":         user.Role,
			"tenant_id":    user.TenantID,
			"tenant_name":  tenantName,
			"totp_enabled": user.TOTPEnabled,
		},
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token requis"})
		return
	}

	// Chercher le refresh token exact parmi les tokens non révoqués et non expirés.
	var candidates []models.RefreshToken
	if err := h.db.Where("revoked_at IS NULL AND expires_at > ?", time.Now()).
		Order("created_at DESC").Find(&candidates).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token invalide ou expiré"})
		return
	}

	var stored *models.RefreshToken
	for i := range candidates {
		if bcrypt.CompareHashAndPassword([]byte(candidates[i].TokenHash), []byte(req.RefreshToken)) == nil {
			stored = &candidates[i]
			break
		}
	}
	if stored == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token invalide"})
		return
	}

	// Révoquer l'ancien refresh token (rotation)
	now := time.Now()
	if err := h.db.Model(stored).Update("revoked_at", now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "révocation refresh token échouée"})
		return
	}

	// Charger l'utilisateur
	var user models.User
	if err := h.db.Where("id = ? AND deleted_at IS NULL", stored.UserID).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "utilisateur introuvable"})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "compte désactivé"})
		return
	}

	// Générer nouveau token pair
	accessToken, err := middleware.GenerateAccessToken(h.cfg, &user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération token échouée"})
		return
	}

	rawRefresh, hashedRefresh, err := models.GenerateRefreshToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération refresh token échouée"})
		return
	}

	refreshExpiry := time.Now().Add(time.Duration(h.cfg.RefreshExpiryDays) * 24 * time.Hour)
	newRefresh := models.RefreshToken{
		UserID:    user.ID,
		TokenHash: hashedRefresh,
		ExpiresAt: refreshExpiry,
		UserAgent: c.GetHeader("User-Agent"),
		IPAddress: c.ClientIP(),
	}
	if err := h.db.Create(&newRefresh).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sauvegarde refresh token échouée"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": rawRefresh,
		"expires_in":    h.cfg.JWTExpiryHours * 3600,
	})
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req logoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token requis"})
		return
	}

	userID := middleware.GetCallerID(c)
	now := time.Now()

	// Révoquer tous les refresh tokens de l'utilisateur
	result := h.db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now)

	if result.RowsAffected == 0 {
		var tokens []models.RefreshToken
		h.db.Where("revoked_at IS NULL AND expires_at > ?", time.Now()).Find(&tokens)
		for _, t := range tokens {
			if bcrypt.CompareHashAndPassword([]byte(t.TokenHash), []byte(req.RefreshToken)) == nil {
				h.db.Model(&t).Update("revoked_at", now)
				break
			}
		}
	}

	// Blacklister le JWT d'accès courant pour révocation immédiate
	if h.rdb != nil {
		if claims := middleware.GetCurrentClaims(c); claims != nil && claims.ExpiresAt != nil {
			middleware.BlacklistToken(context.Background(), h.rdb, claims.ID, claims.ExpiresAt.Time)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "déconnexion réussie"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetCallerID(c)
	var user models.User
	if err := h.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "compte désactivé"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// ── 2FA TOTP ─────────────────────────────────────────────────────

// Setup2FA génère un nouveau secret TOTP et retourne l'URI otpauth:// pour le QR code.
// Le 2FA n'est PAS encore activé — il faut confirmer avec un premier code valide.
func (h *AuthHandler) Setup2FA(c *gin.Context) {
	userID := middleware.GetCallerID(c)

	secret, err := crypto.NewTOTPSecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération secret 2FA échouée"})
		return
	}

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	if user.TOTPEnabled {
		c.JSON(http.StatusConflict, gin.H{"error": "2FA déjà activé — désactivez-le avant de générer un nouveau secret"})
		return
	}

	storedSecret := crypto.EncryptField(secret)
	if err := h.db.Model(&user).Updates(map[string]interface{}{
		"totp_secret":  storedSecret,
		"totp_enabled": false,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sauvegarde secret échouée"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"secret": secret,
		"qr_uri": crypto.TOTPKeyURI("MynaPay", user.Email, secret),
		"note":   "Scannez le QR code avec Google Authenticator ou Authy, puis confirmez via POST /auth/2fa/confirm",
	})
}

// Confirm2FA active le 2FA après vérification d'un premier code valide.
func (h *AuthHandler) Confirm2FA(c *gin.Context) {
	userID := middleware.GetCallerID(c)

	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code requis"})
		return
	}
	req.Code = strings.TrimSpace(req.Code)

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	if user.TOTPSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lancez d'abord la configuration 2FA via POST /auth/2fa/setup"})
		return
	}

	secret := crypto.DecryptField(user.TOTPSecret)
	if !crypto.ValidateTOTP(secret, req.Code) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "code 2FA invalide"})
		return
	}

	h.db.Model(&user).Update("totp_enabled", true)
	c.JSON(http.StatusOK, gin.H{"message": "2FA activé avec succès"})
}

// Disable2FA désactive le 2FA après vérification d'un code valide.
func (h *AuthHandler) Disable2FA(c *gin.Context) {
	userID := middleware.GetCallerID(c)

	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code 2FA requis pour désactiver"})
		return
	}
	req.Code = strings.TrimSpace(req.Code)

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	if !user.TOTPEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "2FA non activé"})
		return
	}

	secret := crypto.DecryptField(user.TOTPSecret)
	if !crypto.ValidateTOTP(secret, req.Code) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "code 2FA invalide"})
		return
	}

	h.db.Model(&user).Updates(map[string]interface{}{
		"totp_secret":  "",
		"totp_enabled": false,
	})
	c.JSON(http.StatusOK, gin.H{"message": "2FA désactivé"})
}

// ── Super Admin ───────────────────────────────────────────────────

type AdminHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewAdminHandler(db *gorm.DB, cfg *config.Config) *AdminHandler {
	return &AdminHandler{db: db, cfg: cfg}
}

// ListTenants retourne tous les tenants avec pagination.
func (h *AdminHandler) ListTenants(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := c.Query("status")

	var tenants []models.Tenant
	var total int64

	q := h.db.Model(&models.Tenant{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	q.Count(&total)
	q.Preload("Wallet").Order("created_at DESC").
		Offset((page - 1) * size).Limit(size).Find(&tenants)

	c.JSON(http.StatusOK, gin.H{
		"data":  tenants,
		"total": total,
		"page":  page,
		"size":  size,
	})
}

type createTenantRequest struct {
	RaisonSociale  string   `json:"raison_sociale" binding:"required"`
	RCCM           string   `json:"rccm" binding:"required"`
	IFU            string   `json:"ifu" binding:"required"`
	Secteur        string   `json:"secteur"`
	CommissionRate *float64 `json:"commission_rate"`
	AdminEmail     string   `json:"admin_email" binding:"required,email"`
	AdminPassword  string   `json:"admin_password" binding:"required,min=8"`
	AdminFirstName string   `json:"admin_first_name" binding:"required"`
	AdminLastName  string   `json:"admin_last_name" binding:"required"`
}

// CreateTenant crée un tenant + son admin + son wallet.
func (h *AdminHandler) CreateTenant(c *gin.Context) {
	var req createTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.RaisonSociale = strings.TrimSpace(req.RaisonSociale)
	req.RCCM = strings.TrimSpace(req.RCCM)
	req.IFU = strings.TrimSpace(req.IFU)
	req.Secteur = strings.TrimSpace(req.Secteur)
	req.AdminEmail = normalizeEmail(req.AdminEmail)
	req.AdminFirstName = strings.TrimSpace(req.AdminFirstName)
	req.AdminLastName = strings.TrimSpace(req.AdminLastName)

	callerID := middleware.GetCallerID(c)
	commRate := h.cfg.DefaultCommissionRate
	if req.CommissionRate != nil {
		commRate = *req.CommissionRate
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password"})
		return
	}

	var tenant models.Tenant
	err = h.db.Transaction(func(tx *gorm.DB) error {
		tenant = models.Tenant{
			Slug:                uniqueSlug(tx, req.RaisonSociale),
			RaisonSociale:       req.RaisonSociale,
			RCCM:                req.RCCM,
			IFU:                 req.IFU,
			Secteur:             req.Secteur,
			Status:              models.TenantStatusKYBPending,
			CommissionRate:      commRate,
			ValidationThreshold: h.cfg.ValidationThreshold,
			CreatedByID:         &callerID,
		}
		if err := tx.Create(&tenant).Error; err != nil {
			return err
		}

		// Wallet initial à 0
		wallet := models.Wallet{TenantID: tenant.ID}
		if err := tx.Create(&wallet).Error; err != nil {
			return err
		}

		// Admin tenant
		user := models.User{
			TenantID:     &tenant.ID,
			Email:        req.AdminEmail,
			PasswordHash: string(hash),
			FirstName:    req.AdminFirstName,
			LastName:     req.AdminLastName,
			Role:         models.RoleTenantAdmin,
		}
		return tx.Create(&user).Error
	})

	if err != nil {
		if isDuplicate(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug ou IFU déjà utilisé"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"tenant": tenant})
}

// ActivateTenant valide le KYB et active le tenant.
func (h *AdminHandler) ActivateTenant(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	result := h.db.Model(&models.Tenant{}).Where("id = ?", tenantID).
		Update("status", models.TenantStatusActive)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "tenant activé"})
}

// SuspendTenant suspend un tenant.
func (h *AdminHandler) SuspendTenant(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	result := h.db.Model(&models.Tenant{}).Where("id = ?", tenantID).
		Update("status", models.TenantStatusSuspended)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "tenant suspendu"})
}

type walletRechargeRequest struct {
	Amount int64 `json:"amount" binding:"required,min=1"`
}

// RechargeWallet crédite le wallet d'un tenant (opération admin).
// La référence est auto-générée au format YYYY-MYNA-XXXX.
func (h *AdminHandler) RechargeWallet(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	var req walletRechargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	callerID := middleware.GetCallerID(c)
	ws := services.NewWalletService(h.db)
	wallet, reference, err := ws.Recharge(tenantID, req.Amount, callerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":   "wallet rechargé",
		"reference": reference,
		"wallet":    wallet,
	})
}

// ListTenantWalletTransactions retourne l'historique wallet d'un tenant (vue admin).
func (h *AdminHandler) ListTenantWalletTransactions(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if size > 100 {
		size = 100
	}

	var txs []models.WalletTransaction
	var total int64
	q := h.db.Model(&models.WalletTransaction{}).Where("tenant_id = ?", tenantID)
	q.Count(&total)
	q.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&txs)

	c.JSON(http.StatusOK, gin.H{"data": txs, "total": total, "page": page, "size": size})
}

// GlobalStats retourne les métriques globales plateforme.
func (h *AdminHandler) GlobalStats(c *gin.Context) {
	var stats struct {
		TotalTenants    int64 `json:"total_tenants"`
		ActiveTenants   int64 `json:"active_tenants"`
		TotalVolume     int64 `json:"total_volume_fcfa"`
		TotalCommission int64 `json:"total_commission_fcfa"`
		TotalBatches    int64 `json:"total_batches"`
	}

	h.db.Model(&models.Tenant{}).Count(&stats.TotalTenants)
	h.db.Model(&models.Tenant{}).Where("status = ?", models.TenantStatusActive).Count(&stats.ActiveTenants)
	h.db.Model(&models.Wallet{}).Select("COALESCE(SUM(total_debited), 0)").Scan(&stats.TotalVolume)
	h.db.Model(&models.Wallet{}).Select("COALESCE(SUM(total_commission), 0)").Scan(&stats.TotalCommission)
	h.db.Model(&models.Batch{}).Where("status = ?", models.BatchStatusCompleted).Count(&stats.TotalBatches)

	c.JSON(http.StatusOK, stats)
}

// ── Tenant ────────────────────────────────────────────────────────

type TenantHandler struct {
	db      *gorm.DB
	rdb     *redis.Client
	cfg     *config.Config
	batches *services.BatchService
	wallet  *services.WalletService
}

func NewTenantHandler(db *gorm.DB, rdb *redis.Client, cfg *config.Config) *TenantHandler {
	return &TenantHandler{
		db:      db,
		rdb:     rdb,
		cfg:     cfg,
		batches: services.NewBatchService(db, rdb),
		wallet:  services.NewWalletService(db),
	}
}

// Dashboard retourne les métriques tenant.
func (h *TenantHandler) Dashboard(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)

	var wallet models.Wallet
	h.db.Where("tenant_id = ?", tenant.ID).First(&wallet)

	var stats struct {
		TotalBeneficiaries int64 `json:"total_beneficiaries"`
		TotalBatches       int64 `json:"total_batches"`
		MonthlyVolume      int64 `json:"monthly_volume_fcfa"`
		FailedItems        int64 `json:"failed_items"`
	}

	h.db.Model(&models.Beneficiary{}).Where("tenant_id = ? AND is_active = true", tenant.ID).Count(&stats.TotalBeneficiaries)
	h.db.Model(&models.Batch{}).Where("tenant_id = ? AND status = ?", tenant.ID, models.BatchStatusCompleted).Count(&stats.TotalBatches)
	h.db.Model(&models.BatchItem{}).Where("tenant_id = ? AND status = ?", tenant.ID, models.ItemStatusFailed).Count(&stats.FailedItems)

	startOfMonth := time.Now().Truncate(24*time.Hour).AddDate(0, 0, -time.Now().Day()+1)
	h.db.Model(&models.Batch{}).
		Where("tenant_id = ? AND status = ? AND created_at >= ?", tenant.ID, models.BatchStatusCompleted, startOfMonth).
		Select("COALESCE(SUM(total_amount), 0)").Scan(&stats.MonthlyVolume)

	var recentBatches []models.Batch
	h.db.Where("tenant_id = ?", tenant.ID).Order("created_at DESC").Limit(5).Find(&recentBatches)

	c.JSON(http.StatusOK, gin.H{
		"wallet":         wallet,
		"stats":          stats,
		"recent_batches": recentBatches,
	})
}

// GetWallet retourne le wallet du tenant.
func (h *TenantHandler) GetWallet(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	wallet, err := h.wallet.GetOrCreate(tenant.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, wallet)
}

// ── Batch endpoints ───────────────────────────────────────────────

func (h *TenantHandler) CreateBatch(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	callerID := middleware.GetCallerID(c)

	var req services.CreateBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	batch, err := h.batches.Create(tenant.ID, callerID, req)
	if err != nil {
		if errors.Is(err, services.ErrInsufficientBalance) {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, batch)
}

func (h *TenantHandler) ListBatches(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))

	batches, total, err := h.batches.ListBatches(tenant.ID, page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": batches, "total": total, "page": page, "size": size})
}

func (h *TenantHandler) GetBatch(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	batchID, err := uuid.Parse(c.Param("batchId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_id invalide"})
		return
	}
	batch, err := h.batches.GetBatch(batchID, tenant.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, batch)
}

func (h *TenantHandler) ValidateBatch(c *gin.Context) {
	callerID := middleware.GetCallerID(c)
	batchID, _ := uuid.Parse(c.Param("batchId"))

	batch, err := h.batches.Validate(batchID, callerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, batch)
}

// ExecuteBatch démarre l'exécution — retourne 202 Accepted immédiatement.
func (h *TenantHandler) ExecuteBatch(c *gin.Context) {
	callerID := middleware.GetCallerID(c)
	batchID, _ := uuid.Parse(c.Param("batchId"))

	batch, err := h.batches.Execute(batchID, callerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{
		"message": "batch en cours d'exécution",
		"batch":   batch,
	})
}

// ── Bénéficiaires ─────────────────────────────────────────────────

func (h *TenantHandler) ListBeneficiaries(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
	search := c.Query("q")

	var benefs []models.Beneficiary
	var total int64

	q := h.db.Model(&models.Beneficiary{}).Where("tenant_id = ? AND deleted_at IS NULL", tenant.ID)
	if search != "" {
		search = strings.TrimSpace(search)
		phone := models.NormalizePhone(search)
		if phone != "" {
			q = q.Where(
				"full_name ILIKE ? OR phone_number LIKE ? OR phone_hash = ?",
				"%"+search+"%",
				"%"+phone+"%",
				crypto.HashField(phone),
			)
		} else {
			q = q.Where("full_name ILIKE ?", "%"+search+"%")
		}
	}
	q.Count(&total)
	q.Order("full_name ASC").Offset((page - 1) * size).Limit(size).Find(&benefs)

	c.JSON(http.StatusOK, gin.H{"data": benefs, "total": total})
}

type beneficiaryRequest struct {
	FullName      string `json:"full_name" binding:"required"`
	PhoneNumber   string `json:"phone_number" binding:"required"`
	GroupName     string `json:"group_name"`
	DefaultAmount int64  `json:"default_amount"`
	ExternalRef   string `json:"external_ref"`
}

func (h *TenantHandler) CreateBeneficiary(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)

	var req beneficiaryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	phone := models.NormalizePhone(req.PhoneNumber)
	op := models.DetectOperator(phone)
	if op == models.OperatorUnknown {
		c.JSON(http.StatusBadRequest, gin.H{"error": "numéro non reconnu — opérateur indéterminé"})
		return
	}

	b := models.Beneficiary{
		TenantID:      tenant.ID,
		FullName:      req.FullName,
		PhoneNumber:   phone,
		Operator:      op,
		GroupName:     req.GroupName,
		DefaultAmount: req.DefaultAmount,
		ExternalRef:   req.ExternalRef,
	}
	if err := h.db.Create(&b).Error; err != nil {
		if isDuplicate(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "numéro déjà enregistré pour ce tenant"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, b)
}

func (h *TenantHandler) DeleteBeneficiary(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	id, _ := uuid.Parse(c.Param("beneficiaryId"))

	result := h.db.Where("id = ? AND tenant_id = ?", id, tenant.ID).Delete(&models.Beneficiary{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "bénéficiaire introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "bénéficiaire supprimé"})
}

// ── Mise à jour bénéficiaire ──────────────────────────────────────

func (h *TenantHandler) UpdateBeneficiary(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	id, err := uuid.Parse(c.Param("beneficiaryId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "beneficiary_id invalide"})
		return
	}

	var req struct {
		FullName      *string `json:"full_name"`
		GroupName     *string `json:"group_name"`
		DefaultAmount *int64  `json:"default_amount"`
		ExternalRef   *string `json:"external_ref"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.FullName != nil {
		updates["full_name"] = *req.FullName
	}
	if req.GroupName != nil {
		updates["group_name"] = *req.GroupName
	}
	if req.DefaultAmount != nil {
		updates["default_amount"] = *req.DefaultAmount
	}
	if req.ExternalRef != nil {
		updates["external_ref"] = *req.ExternalRef
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}

	result := h.db.Model(&models.Beneficiary{}).
		Where("id = ? AND tenant_id = ? AND deleted_at IS NULL", id, tenant.ID).
		Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "bénéficiaire introuvable"})
		return
	}

	var b models.Beneficiary
	h.db.First(&b, "id = ?", id)
	c.JSON(http.StatusOK, b)
}

// ── Transactions wallet ───────────────────────────────────────────

func (h *TenantHandler) ListWalletTransactions(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))

	var txs []models.WalletTransaction
	var total int64

	q := h.db.Model(&models.WalletTransaction{}).Where("tenant_id = ?", tenant.ID)
	q.Count(&total)
	q.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&txs)

	c.JSON(http.StatusOK, gin.H{"data": txs, "total": total, "page": page, "size": size})
}

// ── Gestion des utilisateurs tenant ──────────────────────────────

func (h *TenantHandler) ListUsers(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)

	var users []models.User
	var total int64

	h.db.Model(&models.User{}).Where("tenant_id = ? AND deleted_at IS NULL", tenant.ID).Count(&total)
	h.db.Where("tenant_id = ? AND deleted_at IS NULL", tenant.ID).
		Order("created_at ASC").Find(&users)

	c.JSON(http.StatusOK, gin.H{"data": users, "total": total})
}

type createUserTenantRequest struct {
	Email     string          `json:"email" binding:"required,email"`
	Password  string          `json:"password" binding:"required,min=8"`
	FirstName string          `json:"first_name" binding:"required"`
	LastName  string          `json:"last_name" binding:"required"`
	Role      models.UserRole `json:"role" binding:"required,oneof=tenant_admin tenant_manager tenant_auditor"`
}

func (h *TenantHandler) CreateUser(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)

	var req createUserTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = normalizeEmail(req.Email)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	if !isTenantUserRole(req.Role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rôle tenant invalide"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password"})
		return
	}

	user := models.User{
		TenantID:     &tenant.ID,
		Email:        req.Email,
		PasswordHash: string(hash),
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         req.Role,
	}
	if err := h.db.Create(&user).Error; err != nil {
		if isDuplicate(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "email déjà utilisé"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func (h *TenantHandler) UpdateUser(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}

	var req struct {
		FirstName *string          `json:"first_name"`
		LastName  *string          `json:"last_name"`
		Role      *models.UserRole `json:"role"`
		IsActive  *bool            `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.FirstName != nil {
		updates["first_name"] = strings.TrimSpace(*req.FirstName)
	}
	if req.LastName != nil {
		updates["last_name"] = strings.TrimSpace(*req.LastName)
	}
	if req.Role != nil {
		if !isTenantUserRole(*req.Role) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "rôle tenant invalide"})
			return
		}
		updates["role"] = *req.Role
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}

	result := h.db.Model(&models.User{}).
		Where("id = ? AND tenant_id = ?", userID, tenant.ID).
		Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}

	var user models.User
	h.db.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, user)
}

func (h *TenantHandler) DeleteUser(c *gin.Context) {
	tenant := middleware.GetCurrentTenant(c)
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}

	result := h.db.Where("id = ? AND tenant_id = ?", userID, tenant.ID).Delete(&models.User{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "utilisateur supprimé"})
}

// ── Admin : fiche et mise à jour tenant ───────────────────────────

func (h *AdminHandler) GetTenant(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	var tenant models.Tenant
	if err := h.db.Preload("Wallet").First(&tenant, "id = ?", tenantID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
		return
	}

	var userCount, benefCount, batchCount int64
	h.db.Model(&models.User{}).Where("tenant_id = ? AND deleted_at IS NULL", tenantID).Count(&userCount)
	h.db.Model(&models.Beneficiary{}).Where("tenant_id = ? AND deleted_at IS NULL", tenantID).Count(&benefCount)
	h.db.Model(&models.Batch{}).Where("tenant_id = ?", tenantID).Count(&batchCount)

	c.JSON(http.StatusOK, gin.H{
		"tenant":      tenant,
		"user_count":  userCount,
		"benef_count": benefCount,
		"batch_count": batchCount,
	})
}

func (h *AdminHandler) UpdateTenant(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	var req struct {
		RaisonSociale       *string  `json:"raison_sociale"`
		RCCM                *string  `json:"rccm"`
		IFU                 *string  `json:"ifu"`
		Secteur             *string  `json:"secteur"`
		CommissionRate      *float64 `json:"commission_rate"`
		ValidationThreshold *int64   `json:"validation_threshold"`
		BatchAmountLimit    *int64   `json:"batch_amount_limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.RaisonSociale != nil {
		updates["raison_sociale"] = *req.RaisonSociale
	}
	if req.RCCM != nil {
		rccm := strings.TrimSpace(*req.RCCM)
		if rccm == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "rccm ne peut pas être vide"})
			return
		}
		updates["rccm"] = crypto.EncryptField(rccm)
	}
	if req.IFU != nil {
		ifu := strings.TrimSpace(*req.IFU)
		if ifu == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ifu ne peut pas être vide"})
			return
		}
		updates["ifu"] = crypto.EncryptField(ifu)
		updates["ifu_hash"] = crypto.HashField(ifu)
	}
	if req.Secteur != nil {
		updates["secteur"] = *req.Secteur
	}
	if req.CommissionRate != nil {
		updates["commission_rate"] = *req.CommissionRate
	}
	if req.ValidationThreshold != nil {
		updates["validation_threshold"] = *req.ValidationThreshold
	}
	if req.BatchAmountLimit != nil {
		updates["batch_amount_limit"] = *req.BatchAmountLimit
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}

	result := h.db.Model(&models.Tenant{}).Where("id = ?", tenantID).Updates(updates)
	if result.Error != nil {
		if isDuplicate(result.Error) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug ou IFU déjà utilisé"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
		return
	}

	var tenant models.Tenant
	h.db.Preload("Wallet").First(&tenant, "id = ?", tenantID)
	c.JSON(http.StatusOK, tenant)
}

// ── KYB Handlers ──────────────────────────────────────────────────

// ListKYBDocuments retourne tous les documents KYB d'un tenant.
func (h *AdminHandler) ListKYBDocuments(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	var docs []models.KYBDocument
	h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").Find(&docs)
	c.JSON(http.StatusOK, gin.H{"data": docs})
}

// UploadKYBDocument enregistre un document KYB.
func (h *AdminHandler) UploadKYBDocument(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	callerID := middleware.GetCallerID(c)

	var req struct {
		Type     string `json:"type" binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		MimeType string `json:"mime_type"`
		FileSize int64  `json:"file_size"`
		FileData string `json:"file_data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	fileBytes, err := base64.StdEncoding.DecodeString(req.FileData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fichier KYB invalide"})
		return
	}
	if len(fileBytes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fichier KYB vide"})
		return
	}
	if len(fileBytes) > maxKYBUploadSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "fichier KYB trop volumineux"})
		return
	}

	docID := uuid.New()
	originalName := filepath.Base(strings.TrimSpace(req.FileName))
	ext := strings.ToLower(filepath.Ext(originalName))
	nameWithoutExt := strings.TrimSuffix(originalName, filepath.Ext(originalName))
	safeName := strings.Trim(fileNameUnsafe.ReplaceAllString(nameWithoutExt, "_"), "._-")
	if safeName == "" {
		safeName = "document"
	}
	storedName := fmt.Sprintf("%s-%s%s", docID.String(), safeName, ext)
	dir := filepath.Join("uploads", "kyb", tenantID.String())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "création dossier KYB échouée"})
		return
	}
	storedPath := filepath.Join(dir, storedName)
	if err := os.WriteFile(storedPath, fileBytes, 0o600); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "écriture fichier KYB échouée"})
		return
	}

	doc := models.KYBDocument{
		ID:           docID,
		TenantID:     tenantID,
		Type:         models.KYBDocumentType(req.Type),
		OriginalName: originalName,
		MimeType:     req.MimeType,
		FileSize:     int64(len(fileBytes)),
		FilePath:     filepath.ToSlash(storedPath),
		Status:       models.KYBDocPending,
		UploadedBy:   callerID,
	}
	if err := h.db.Create(&doc).Error; err != nil {
		_ = os.Remove(storedPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.db.Create(&models.KYBHistory{
		TenantID:  tenantID,
		Action:    "document_uploaded",
		Comment:   fmt.Sprintf("Document %s téléversé : %s", req.Type, req.FileName),
		CreatedBy: callerID,
	})

	c.JSON(http.StatusCreated, doc)
}

// ReviewKYBDocument approuve ou rejette un document KYB.
func (h *AdminHandler) ReviewKYBDocument(c *gin.Context) {
	docID, err := uuid.Parse(c.Param("docId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "doc_id invalide"})
		return
	}
	callerID := middleware.GetCallerID(c)

	var req struct {
		Status     string `json:"status" binding:"required,oneof=approved rejected"`
		ReviewNote string `json:"review_note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var doc models.KYBDocument
	if err := h.db.First(&doc, "id = ?", docID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document introuvable"})
		return
	}

	now := time.Now()
	h.db.Model(&doc).Updates(map[string]interface{}{
		"status":      models.KYBDocumentStatus(req.Status),
		"review_note": req.ReviewNote,
		"reviewed_by": callerID,
		"reviewed_at": now,
	})

	action := "document_approved"
	if req.Status == "rejected" {
		action = "document_rejected"
	}
	h.db.Create(&models.KYBHistory{
		TenantID:  doc.TenantID,
		Action:    action,
		Comment:   req.ReviewNote,
		CreatedBy: callerID,
	})

	c.JSON(http.StatusOK, doc)
}

// ListKYBComments retourne les commentaires KYB d'un tenant.
func (h *AdminHandler) ListKYBComments(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	var comments []models.KYBComment
	h.db.Where("tenant_id = ?", tenantID).Order("created_at ASC").Find(&comments)
	c.JSON(http.StatusOK, gin.H{"data": comments})
}

// AddKYBComment ajoute un commentaire KYB.
func (h *AdminHandler) AddKYBComment(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	callerID := middleware.GetCallerID(c)

	var req struct {
		Comment string `json:"comment" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	comment := models.KYBComment{
		TenantID:  tenantID,
		Comment:   req.Comment,
		CreatedBy: callerID,
	}
	if err := h.db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// GetKYBHistory retourne l'historique KYB d'un tenant.
func (h *AdminHandler) GetKYBHistory(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}

	var history []models.KYBHistory
	h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").Find(&history)
	c.JSON(http.StatusOK, gin.H{"data": history})
}

// RejectKYB rejette un dossier KYB complet et le remet en prospect.
func (h *AdminHandler) RejectKYB(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	callerID := middleware.GetCallerID(c)

	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var tenant models.Tenant
	if err := h.db.First(&tenant, "id = ?", tenantID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
		return
	}

	oldStatus := tenant.Status
	newStatus := models.TenantStatusProspect

	h.db.Model(&tenant).Update("status", newStatus)

	h.db.Create(&models.KYBHistory{
		TenantID:  tenantID,
		Action:    "kyb_rejected",
		OldStatus: &oldStatus,
		NewStatus: &newStatus,
		Comment:   req.Reason,
		CreatedBy: callerID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "KYB rejeté, tenant repassé en prospect"})
}

// ── Admin : gestion des utilisateurs d'un tenant ─────────────────

func (h *AdminHandler) ListTenantUsers(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	var users []models.User
	var total int64
	h.db.Model(&models.User{}).Where("tenant_id = ? AND deleted_at IS NULL", tenantID).Count(&total)
	h.db.Where("tenant_id = ? AND deleted_at IS NULL", tenantID).Order("created_at ASC").Find(&users)
	c.JSON(http.StatusOK, gin.H{"data": users, "total": total})
}

func (h *AdminHandler) CreateTenantUser(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	var req createUserTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = normalizeEmail(req.Email)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	if !isTenantUserRole(req.Role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rôle tenant invalide"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password"})
		return
	}
	user := models.User{
		TenantID:     &tenantID,
		Email:        req.Email,
		PasswordHash: string(hash),
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         req.Role,
	}
	if err := h.db.Create(&user).Error; err != nil {
		if isDuplicate(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "email déjà utilisé"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func (h *AdminHandler) UpdateTenantUser(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}
	var req struct {
		FirstName *string          `json:"first_name"`
		LastName  *string          `json:"last_name"`
		Role      *models.UserRole `json:"role"`
		IsActive  *bool            `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if req.FirstName != nil {
		updates["first_name"] = strings.TrimSpace(*req.FirstName)
	}
	if req.LastName != nil {
		updates["last_name"] = strings.TrimSpace(*req.LastName)
	}
	if req.Role != nil {
		if !isTenantUserRole(*req.Role) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "rôle tenant invalide"})
			return
		}
		updates["role"] = *req.Role
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}
	result := h.db.Model(&models.User{}).
		Where("id = ? AND tenant_id = ?", userID, tenantID).
		Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	var user models.User
	h.db.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, user)
}

func (h *AdminHandler) DeleteTenantUser(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Param("tenantId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
		return
	}
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}
	result := h.db.Where("id = ? AND tenant_id = ?", userID, tenantID).Delete(&models.User{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "utilisateur supprimé"})
}

// ── Super Admin User Management ────────────────────────────────────

// ListAdminUsers liste les super admins.
func (h *AdminHandler) ListAdminUsers(c *gin.Context) {
	var users []models.User
	var total int64

	h.db.Model(&models.User{}).Where("role = ? AND deleted_at IS NULL", models.RoleSuperAdmin).Count(&total)
	h.db.Where("role = ? AND deleted_at IS NULL", models.RoleSuperAdmin).
		Order("created_at DESC").Find(&users)

	c.JSON(http.StatusOK, gin.H{"data": users, "total": total})
}

type createAdminUserRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
}

// CreateAdminUser crée un super admin.
func (h *AdminHandler) CreateAdminUser(c *gin.Context) {
	var req createAdminUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Email = normalizeEmail(req.Email)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password"})
		return
	}

	user := models.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         models.RoleSuperAdmin,
	}
	if err := h.db.Create(&user).Error; err != nil {
		if isDuplicate(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "email déjà utilisé"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

// UpdateAdminUser modifie un super admin.
func (h *AdminHandler) UpdateAdminUser(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}

	var req struct {
		FirstName *string `json:"first_name"`
		LastName  *string `json:"last_name"`
		IsActive  *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.FirstName != nil {
		updates["first_name"] = strings.TrimSpace(*req.FirstName)
	}
	if req.LastName != nil {
		updates["last_name"] = strings.TrimSpace(*req.LastName)
	}
	if req.IsActive != nil {
		if !*req.IsActive && !hasAnotherActiveSuperAdmin(h.db, userID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "impossible de désactiver le dernier super admin actif"})
			return
		}
		updates["is_active"] = *req.IsActive
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}

	result := h.db.Model(&models.User{}).
		Where("id = ? AND role = ?", userID, models.RoleSuperAdmin).
		Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin introuvable"})
		return
	}

	var user models.User
	h.db.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, user)
}

// DeleteAdminUser supprime (soft-delete) un super admin.
func (h *AdminHandler) DeleteAdminUser(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id invalide"})
		return
	}

	// Empêcher l'auto-suppression
	callerID := middleware.GetCallerID(c)
	if callerID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "impossible de se supprimer soi-même"})
		return
	}
	if !hasAnotherActiveSuperAdmin(h.db, userID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "impossible de supprimer le dernier super admin actif"})
		return
	}

	result := h.db.Where("id = ? AND role = ?", userID, models.RoleSuperAdmin).Delete(&models.User{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "admin supprimé"})
}

// ── Enhanced GlobalStats ──────────────────────────────────────────

func (h *AdminHandler) GlobalStatsV2(c *gin.Context) {
	var stats struct {
		TotalTenants      int64 `json:"total_tenants"`
		ActiveTenants     int64 `json:"active_tenants"`
		SuspendedTenants  int64 `json:"suspended_tenants"`
		KYBPendingCount   int64 `json:"kyb_pending_count"`
		TotalVolume       int64 `json:"total_volume_fcfa"`
		TotalCommission   int64 `json:"total_commission_fcfa"`
		TotalBatches      int64 `json:"total_batches"`
		FailedBatches     int64 `json:"failed_batches"`
		ProcessingBatches int64 `json:"processing_batches"`
		TotalRecharges    int64 `json:"total_recharges_fcfa"`
	}

	h.db.Model(&models.Tenant{}).Count(&stats.TotalTenants)
	h.db.Model(&models.Tenant{}).Where("status = ?", models.TenantStatusActive).Count(&stats.ActiveTenants)
	h.db.Model(&models.Tenant{}).Where("status = ?", models.TenantStatusSuspended).Count(&stats.SuspendedTenants)
	h.db.Model(&models.Tenant{}).Where("status = ?", models.TenantStatusKYBPending).Count(&stats.KYBPendingCount)
	h.db.Model(&models.Wallet{}).Select("COALESCE(SUM(total_debited), 0)").Scan(&stats.TotalVolume)
	h.db.Model(&models.Wallet{}).Select("COALESCE(SUM(total_commission), 0)").Scan(&stats.TotalCommission)
	h.db.Model(&models.Batch{}).Where("status = ?", models.BatchStatusCompleted).Count(&stats.TotalBatches)
	h.db.Model(&models.Batch{}).Where("status = ?", models.BatchStatusFailed).Count(&stats.FailedBatches)
	h.db.Model(&models.Batch{}).Where("status = ?", models.BatchStatusProcessing).Count(&stats.ProcessingBatches)
	h.db.Model(&models.WalletTransaction{}).Where("type = ?", models.WalletTxRecharge).
		Select("COALESCE(SUM(amount), 0)").Scan(&stats.TotalRecharges)

	c.JSON(http.StatusOK, stats)
}

// ── Helper ────────────────────────────────────────────────────────

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isTenantUserRole(role models.UserRole) bool {
	return role == models.RoleTenantAdmin ||
		role == models.RoleTenantManager ||
		role == models.RoleTenantAuditor
}

func hasAnotherActiveSuperAdmin(db *gorm.DB, excludeID uuid.UUID) bool {
	var count int64
	db.Model(&models.User{}).
		Where("role = ? AND is_active = true AND id <> ? AND deleted_at IS NULL", models.RoleSuperAdmin, excludeID).
		Count(&count)
	return count > 0
}

func isDuplicate(err error) bool {
	if err == nil {
		return false
	}
	// Code d'erreur PostgreSQL unique_violation = 23505
	return len(err.Error()) > 0 && (contains(err.Error(), "23505") || contains(err.Error(), "duplicate"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 &&
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}
