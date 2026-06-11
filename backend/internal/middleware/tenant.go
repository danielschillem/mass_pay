package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"masspay-bf/internal/models"
)

// isKYBRoute retourne true si le chemin est une route KYB self-service tenant.
func isKYBRoute(path string) bool {
	return strings.HasPrefix(path, "/api/v1/tenant/kyb")
}

func isKYBStatusRoute(method, path string) bool {
	return method == http.MethodGet && strings.HasPrefix(path, "/api/v1/tenant/kyb/status")
}

const ctxTenant = "current_tenant"

// TenantGuard vérifie que l'utilisateur appartient au tenant demandé
// et que le tenant est actif. Injecte le tenant dans le contexte.
//
// Usage : les routes tenant utilisent /tenants/:tenantId/...
// Le super_admin peut accéder à n'importe quel tenant.
func TenantGuard(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantIDStr := c.Param("tenantId")

		// Si pas de param dans l'URL, utiliser le tenant du token
		if tenantIDStr == "" {
			callerTenantID := GetCallerTenantID(c)
			if callerTenantID == nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "tenant_id requis"})
				return
			}
			tenantIDStr = callerTenantID.String()
		}

		tenantID, err := uuid.Parse(tenantIDStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "tenant_id invalide"})
			return
		}

		role := GetCallerRole(c)

		// Un utilisateur non super_admin ne peut accéder qu'à son propre tenant
		if role != models.RoleSuperAdmin {
			callerTenantID := GetCallerTenantID(c)
			if callerTenantID == nil || *callerTenantID != tenantID {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "accès refusé à ce tenant"})
				return
			}
		}

		var tenant models.Tenant
		if err := db.First(&tenant, "id = ?", tenantID).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "tenant introuvable"})
			return
		}

		switch tenant.Status {
		case models.TenantStatusSuspended:
			if isKYBStatusRoute(c.Request.Method, c.Request.URL.Path) {
				break
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "tenant suspendu", "code": "tenant_suspended"})
			return
		case models.TenantStatusKYBPending, models.TenantStatusProspect:
			// Autoriser seulement les routes KYB self-service
			if !isKYBRoute(c.Request.URL.Path) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "validation KYB requise", "code": "kyb_required"})
				return
			}
		}

		c.Set(ctxTenant, &tenant)
		c.Next()
	}
}

// GetCurrentTenant retourne le tenant injecté par TenantGuard.
func GetCurrentTenant(c *gin.Context) *models.Tenant {
	v, _ := c.Get(ctxTenant)
	t, _ := v.(*models.Tenant)
	return t
}
