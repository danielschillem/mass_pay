package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

type Claims struct {
	UserID   uuid.UUID       `json:"user_id"`
	TenantID *uuid.UUID      `json:"tenant_id,omitempty"`
	Role     models.UserRole `json:"role"`
	KeyID    string          `json:"kid,omitempty"`
	jwt.RegisteredClaims
}

const (
	ctxUserID   = "user_id"
	ctxTenantID = "tenant_id"
	ctxRole     = "role"
	ctxClaims   = "claims"
)

// jwtKeyFunc retourne la clé correspondant au kid dans le header du token.
// Si le kid est absent ou ne correspond pas, on essaie la JWT_SECRET courante.
// En cas d'échec, on essaie JWT_SECRET_PREVIOUS (rotation).
func jwtKeyFunc(cfg *config.Config) func(t *jwt.Token) (interface{}, error) {
	return func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		kid := ""
		if header, ok := t.Header["kid"].(string); ok {
			kid = header
		}
		switch kid {
		case "current":
			return []byte(cfg.JWTSecret), nil
		case "previous":
			if cfg.JWTSecretPrevious != "" {
				return []byte(cfg.JWTSecretPrevious), nil
			}
		}
		// fallback: essayer la clé courante puis l'ancienne
		if verifyTokenSignature(t, cfg.JWTSecret) {
			return []byte(cfg.JWTSecret), nil
		}
		if cfg.JWTSecretPrevious != "" && verifyTokenSignature(t, cfg.JWTSecretPrevious) {
			return []byte(cfg.JWTSecretPrevious), nil
		}
		return nil, jwt.ErrSignatureInvalid
	}
}

func verifyTokenSignature(t *jwt.Token, key string) bool {
	if key == "" {
		return false
	}
	idx := strings.LastIndex(t.Raw, ".")
	if idx <= 0 {
		return false
	}
	signingString := t.Raw[:idx]
	return t.Method.Verify(signingString, t.Signature, []byte(key)) == nil
}

// Auth valide le JWT Bearer et injecte les claims dans le contexte.
func Auth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token manquant"})
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, jwtKeyFunc(cfg))
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token invalide ou expiré"})
			return
		}

		c.Set(ctxUserID, claims.UserID)
		c.Set(ctxTenantID, claims.TenantID)
		c.Set(ctxRole, claims.Role)
		c.Set(ctxClaims, claims)
		c.Next()
	}
}

// RequireActiveUser recharge l'utilisateur depuis la base.
// Cela invalide immédiatement les comptes désactivés/supprimés et applique les
// changements de rôle sans attendre l'expiration du JWT.
func RequireActiveUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetCallerID(c)
		if userID == uuid.Nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token invalide"})
			return
		}

		var user models.User
		if err := db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "utilisateur introuvable"})
			return
		}
		if !user.IsActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "compte désactivé"})
			return
		}

		c.Set(ctxTenantID, user.TenantID)
		c.Set(ctxRole, user.Role)
		c.Next()
	}
}

// ── RBAC par permission ────────────────────────────────────────────

// Permission représente une action spécifique dans le système.
type Permission string

const (
	PermTenantRead        Permission = "tenant:read"
	PermTenantWrite       Permission = "tenant:write"
	PermTenantActivate    Permission = "tenant:activate"
	PermTenantSuspend     Permission = "tenant:suspend"
	PermKYBRead           Permission = "kyb:read"
	PermKYBWrite          Permission = "kyb:write"
	PermKYBReview         Permission = "kyb:review"
	PermWalletRecharge    Permission = "wallet:recharge"
	PermWalletRead        Permission = "wallet:read"
	PermAdminUserRead     Permission = "admin_user:read"
	PermAdminUserWrite    Permission = "admin_user:write"
	PermAdminUserDelete   Permission = "admin_user:delete"
	PermBatchCreate       Permission = "batch:create"
	PermBatchValidate     Permission = "batch:validate"
	PermBatchExecute      Permission = "batch:execute"
	PermBatchRead         Permission = "batch:read"
	PermBeneficiaryRead   Permission = "beneficiary:read"
	PermBeneficiaryWrite  Permission = "beneficiary:write"
	PermBeneficiaryDelete Permission = "beneficiary:delete"
	PermTenantUserRead    Permission = "tenant_user:read"
	PermTenantUserWrite   Permission = "tenant_user:write"
	PermTenantUserDelete  Permission = "tenant_user:delete"
)

// RolePermissions définit les permissions accordées à chaque rôle.
var RolePermissions = map[models.UserRole][]Permission{
	models.RoleSuperAdmin: {
		PermTenantRead, PermTenantWrite, PermTenantActivate, PermTenantSuspend,
		PermKYBRead, PermKYBWrite, PermKYBReview,
		PermWalletRecharge, PermWalletRead,
		PermAdminUserRead, PermAdminUserWrite, PermAdminUserDelete,
		PermBatchCreate, PermBatchValidate, PermBatchExecute, PermBatchRead,
		PermBeneficiaryRead, PermBeneficiaryWrite, PermBeneficiaryDelete,
		PermTenantUserRead, PermTenantUserWrite, PermTenantUserDelete,
	},
	models.RoleTenantAdmin: {
		PermWalletRead,
		PermBatchCreate, PermBatchValidate, PermBatchExecute, PermBatchRead,
		PermBeneficiaryRead, PermBeneficiaryWrite, PermBeneficiaryDelete,
		PermTenantUserRead, PermTenantUserWrite, PermTenantUserDelete,
	},
	models.RoleTenantManager: {
		PermWalletRead,
		PermBatchCreate, PermBatchRead,
		PermBeneficiaryRead, PermBeneficiaryWrite,
		PermTenantUserRead,
	},
	models.RoleTenantAuditor: {
		PermWalletRead,
		PermBatchRead,
		PermBeneficiaryRead,
		PermTenantUserRead,
	},
}

// RequirePermission vérifie que l'utilisateur possède la permission spécifiée.
func RequirePermission(perm Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ctxRole)
		r, ok := role.(models.UserRole)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "accès refusé"})
			return
		}
		perms, exists := RolePermissions[r]
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "accès refusé"})
			return
		}
		allowed := false
		for _, p := range perms {
			if p == perm {
				allowed = true
				break
			}
		}
		if !allowed {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "permission manquante"})
			return
		}
		c.Next()
	}
}

// RequireRole vérifie que l'utilisateur a l'un des rôles autorisés.
func RequireRole(roles ...models.UserRole) gin.HandlerFunc {
	allowed := make(map[models.UserRole]bool)
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		role, _ := c.Get(ctxRole)
		if r, ok := role.(models.UserRole); !ok || !allowed[r] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "accès refusé"})
			return
		}
		c.Next()
	}
}

// RequireSuperAdmin raccourci pour les routes Super Admin.
func RequireSuperAdmin() gin.HandlerFunc {
	return RequireRole(models.RoleSuperAdmin)
}

// GetCallerID retourne l'UUID de l'utilisateur depuis le contexte Gin.
func GetCallerID(c *gin.Context) uuid.UUID {
	v, _ := c.Get(ctxUserID)
	id, _ := v.(uuid.UUID)
	return id
}

// GetCallerTenantID retourne le TenantID depuis le contexte (nil pour super_admin).
func GetCallerTenantID(c *gin.Context) *uuid.UUID {
	v, _ := c.Get(ctxTenantID)
	id, _ := v.(*uuid.UUID)
	return id
}

// GetCallerRole retourne le rôle depuis le contexte.
func GetCallerRole(c *gin.Context) models.UserRole {
	v, _ := c.Get(ctxRole)
	role, _ := v.(models.UserRole)
	return role
}

// GenerateAccessToken génère un JWT signé avec support kid pour rotation.
func GenerateAccessToken(cfg *config.Config, user *models.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		KeyID:    "current",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(cfg.JWTExpiryHours) * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = "current"
	return token.SignedString([]byte(cfg.JWTSecret))
}
