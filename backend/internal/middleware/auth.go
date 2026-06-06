package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/crypto"
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
	ctxUser     = "current_user"
)

// jwtKeyFunc retourne la clé correspondant au kid dans le header du token.
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
	return t.Method.Verify(t.Raw[:idx], t.Signature, []byte(key)) == nil
}

// Auth valide le JWT Bearer, vérifie la blacklist Redis et injecte les claims dans le contexte.
func Auth(cfg *config.Config, rdb *redis.Client) gin.HandlerFunc {
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

		// Vérification blacklist — token révoqué après logout
		if claims.ID != "" && rdb != nil {
			ctx := context.Background()
			exists, _ := rdb.Exists(ctx, "blacklist:jti:"+claims.ID).Result()
			if exists > 0 {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token révoqué"})
				return
			}
		}

		c.Set(ctxUserID, claims.UserID)
		c.Set(ctxTenantID, claims.TenantID)
		c.Set(ctxRole, claims.Role)
		c.Set(ctxClaims, claims)
		c.Next()
	}
}

// RequireActiveUser recharge l'utilisateur depuis la base et le stocke dans le contexte.
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

		c.Set(ctxUser, &user)
		c.Set(ctxTenantID, user.TenantID)
		c.Set(ctxRole, user.Role)
		c.Next()
	}
}

// Require2FA vérifie le code TOTP via le header X-TOTP-Code pour les actions financières.
// Anti-replay : chaque code n'est valide qu'une fois par fenêtre de 30 secondes.
func Require2FA(cfg *config.Config, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentification requise"})
			return
		}

		if !user.TOTPEnabled {
			if cfg.TOTPRequired {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error":  "2FA obligatoire pour cette action",
					"action": "Configurez votre application d'authentification via POST /auth/2fa/setup",
				})
				return
			}
			// 2FA non encore configuré et non obligatoire — laisser passer
			c.Next()
			return
		}

		code := strings.TrimSpace(c.GetHeader("X-TOTP-Code"))
		if code == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "code 2FA requis (header X-TOTP-Code)",
			})
			return
		}

		// Anti-replay : un code ne peut être utilisé qu'une fois par fenêtre (30s)
		if rdb == nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "service 2FA temporairement indisponible"})
			return
		}
		window := crypto.CurrentTOTPWindow()
		replayKey := "totp:used:" + user.ID.String() + ":" + window + ":" + code
		ctx := context.Background()
		set, err := rdb.SetNX(ctx, replayKey, 1, 90*time.Second).Result()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "service 2FA temporairement indisponible"})
			return
		}
		if !set {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "code 2FA déjà utilisé"})
			return
		}

		secret := crypto.DecryptField(user.TOTPSecret)
		if !crypto.ValidateTOTP(secret, code) {
			rdb.Del(ctx, replayKey) // annuler la réservation anti-replay si code invalide
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "code 2FA invalide"})
			return
		}

		c.Next()
	}
}

// BlacklistToken place un JTI dans la blacklist Redis jusqu'à son expiration.
func BlacklistToken(ctx context.Context, rdb *redis.Client, jti string, expiry time.Time) {
	ttl := time.Until(expiry)
	if ttl > 0 && jti != "" {
		rdb.Set(ctx, "blacklist:jti:"+jti, 1, ttl)
	}
}

// ── RBAC par permission ────────────────────────────────────────────

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
		for _, p := range perms {
			if p == perm {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "permission manquante"})
	}
}

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

func RequireSuperAdmin() gin.HandlerFunc {
	return RequireRole(models.RoleSuperAdmin)
}

// ── Accesseurs contexte ────────────────────────────────────────────

func GetCallerID(c *gin.Context) uuid.UUID {
	v, _ := c.Get(ctxUserID)
	id, _ := v.(uuid.UUID)
	return id
}

func GetCallerTenantID(c *gin.Context) *uuid.UUID {
	v, _ := c.Get(ctxTenantID)
	id, _ := v.(*uuid.UUID)
	return id
}

func GetCallerRole(c *gin.Context) models.UserRole {
	v, _ := c.Get(ctxRole)
	role, _ := v.(models.UserRole)
	return role
}

func GetCurrentUser(c *gin.Context) *models.User {
	v, _ := c.Get(ctxUser)
	u, _ := v.(*models.User)
	return u
}

func GetCurrentClaims(c *gin.Context) *Claims {
	v, _ := c.Get(ctxClaims)
	cl, _ := v.(*Claims)
	return cl
}

// GenerateAccessToken génère un JWT signé avec JTI pour support de blacklist.
func GenerateAccessToken(cfg *config.Config, user *models.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		KeyID:    "current",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(), // JTI — identifiant unique du token pour blacklist
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(cfg.JWTExpiryHours) * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = "current"
	return token.SignedString([]byte(cfg.JWTSecret))
}
