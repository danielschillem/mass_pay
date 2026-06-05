package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

type Claims struct {
	UserID   uuid.UUID         `json:"user_id"`
	TenantID *uuid.UUID        `json:"tenant_id,omitempty"`
	Role     models.UserRole   `json:"role"`
	jwt.RegisteredClaims
}

const (
	ctxUserID   = "user_id"
	ctxTenantID = "tenant_id"
	ctxRole     = "role"
	ctxClaims   = "claims"
)

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
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})
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

// GenerateAccessToken génère un JWT signé.
func GenerateAccessToken(cfg *config.Config, user *models.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(cfg.JWTExpiryHours) * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}
