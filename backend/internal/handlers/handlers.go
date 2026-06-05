package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/middleware"
	"masspay-bf/internal/models"
	"masspay-bf/internal/services"

	"github.com/redis/go-redis/v9"
)

// ── Auth ──────────────────────────────────────────────────────────

type AuthHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
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

	token, err := middleware.GenerateAccessToken(h.cfg, &user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération token échouée"})
		return
	}

	now := time.Now()
	h.db.Model(&user).Update("last_login_at", now)

	c.JSON(http.StatusOK, gin.H{
		"access_token": token,
		"user": gin.H{
			"id":        user.ID,
			"email":     user.Email,
			"full_name": user.FullName(),
			"role":      user.Role,
			"tenant_id": user.TenantID,
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetCallerID(c)
	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
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
		Offset((page-1)*size).Limit(size).Find(&tenants)

	c.JSON(http.StatusOK, gin.H{
		"data":  tenants,
		"total": total,
		"page":  page,
		"size":  size,
	})
}

type createTenantRequest struct {
	RaisonSociale string  `json:"raison_sociale" binding:"required"`
	RCCM          string  `json:"rccm" binding:"required"`
	IFU           string  `json:"ifu" binding:"required"`
	Secteur       string  `json:"secteur"`
	Slug          string  `json:"slug" binding:"required"`
	CommissionRate *float64 `json:"commission_rate"` // nil = défaut global
	AdminEmail    string  `json:"admin_email" binding:"required,email"`
	AdminPassword string  `json:"admin_password" binding:"required,min=8"`
	AdminFirstName string `json:"admin_first_name" binding:"required"`
	AdminLastName  string `json:"admin_last_name" binding:"required"`
}

// CreateTenant crée un tenant + son admin + son wallet.
func (h *AdminHandler) CreateTenant(c *gin.Context) {
	var req createTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

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
			Slug:            req.Slug,
			RaisonSociale:   req.RaisonSociale,
			RCCM:            req.RCCM,
			IFU:             req.IFU,
			Secteur:         req.Secteur,
			Status:          models.TenantStatusKYBPending,
			CommissionRate:  commRate,
			ValidationThreshold: h.cfg.ValidationThreshold,
			CreatedByID:     &callerID,
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
	tenantID, _ := uuid.Parse(c.Param("tenantId"))
	h.db.Model(&models.Tenant{}).Where("id = ?", tenantID).
		Update("status", models.TenantStatusSuspended)
	c.JSON(http.StatusOK, gin.H{"message": "tenant suspendu"})
}

// GlobalStats retourne les métriques globales plateforme.
func (h *AdminHandler) GlobalStats(c *gin.Context) {
	var stats struct {
		TotalTenants  int64   `json:"total_tenants"`
		ActiveTenants int64   `json:"active_tenants"`
		TotalVolume   int64   `json:"total_volume_fcfa"`
		TotalCommission int64 `json:"total_commission_fcfa"`
		TotalBatches  int64   `json:"total_batches"`
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
		q = q.Where("full_name ILIKE ? OR phone_number LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	q.Count(&total)
	q.Order("full_name ASC").Offset((page-1)*size).Limit(size).Find(&benefs)

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

// ── Helper ────────────────────────────────────────────────────────

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
