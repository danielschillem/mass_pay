package notifications

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"masspay-bf/internal/mail"
	"masspay-bf/internal/models"
)

type Notifier struct {
	sender mail.Sender
	db     *gorm.DB
	log    *logrus.Logger
}

func New(sender mail.Sender, db *gorm.DB, log *logrus.Logger) *Notifier {
	return &Notifier{sender: sender, db: db, log: log}
}

// tenantAdminEmail retourne l'email du premier tenant_admin actif d'un tenant.
func (n *Notifier) tenantAdminEmail(tenantID uuid.UUID) string {
	var user models.User
	err := n.db.
		Where("tenant_id = ? AND role = ? AND is_active = true AND deleted_at IS NULL", tenantID, models.RoleTenantAdmin).
		Order("created_at ASC").
		First(&user).Error
	if err != nil {
		return ""
	}
	return user.Email
}

func (n *Notifier) send(ctx context.Context, to, subject, html, text string) {
	if !n.sender.Configured() {
		return
	}
	if to == "" {
		return
	}
	result, err := n.sender.Send(ctx, mail.Message{
		To:      []string{to},
		Subject: subject,
		HTML:    html,
		Text:    text,
	})
	if err != nil {
		n.log.WithFields(logrus.Fields{
			"to":      to,
			"subject": subject,
		}).Warnf("notification mail échouée: %v", err)
		return
	}
	n.log.WithFields(logrus.Fields{
		"to":         to,
		"subject":    subject,
		"message_id": result.MessageID,
	}).Info("notification mail envoyée")
}

// ── Notifications ─────────────────────────────────────────────────

// BatchCompleted envoie un récapitulatif après la clôture d'un batch.
func (n *Notifier) BatchCompleted(ctx context.Context, batch *models.Batch) {
	to := n.tenantAdminEmail(batch.TenantID)
	if to == "" {
		return
	}

	succeeded := batch.Status == models.BatchStatusCompleted
	statusLabel := "terminé avec succès"
	statusColor := "#0DC98A"
	if !succeeded {
		statusLabel = "échoué"
		statusColor = "#F05252"
	}
	if batch.SuccessCount > 0 && batch.FailureCount > 0 {
		statusLabel = "terminé avec des erreurs"
		statusColor = "#E4A730"
	}

	subject := fmt.Sprintf("MynaPay — Batch « %s » %s", batch.Label, statusLabel)

	var completedAt string
	if batch.CompletedAt != nil {
		completedAt = batch.CompletedAt.In(time.UTC).Format("02/01/2006 à 15:04 UTC")
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <!-- Header -->
  <tr><td style="background:#1A1F2E;padding:28px 36px;text-align:center">
    <span style="font-size:22px;font-weight:800;color:#E4A730;letter-spacing:-0.5px">MynaPay</span>
  </td></tr>
  <!-- Status banner -->
  <tr><td style="background:%s;padding:16px 36px;text-align:center">
    <span style="font-size:15px;font-weight:700;color:#ffffff">Batch %s</span>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1A1F2E">%s</p>
    <p style="margin:0 0 28px;font-size:13px;color:#6B7280">%s · %s</p>
    <!-- Stats table -->
    <table width="100%%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#F9FAFB">
        <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Indicateur</td>
        <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;text-align:right">Valeur</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Bénéficiaires</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A1F2E;text-align:right">%d</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Virements réussis</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0DC98A;text-align:right">%d</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Virements échoués</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#F05252;text-align:right">%d</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Masse versée</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A1F2E;text-align:right">%s</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Commission plateforme</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#E4A730;text-align:right">%s</td>
      </tr>
    </table>
    %s
    <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6">
      Connectez-vous à votre espace MynaPay pour consulter le détail des virements.
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#F9FAFB;padding:18px 36px;text-align:center;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© %d MynaPay BF · Ce message est automatique, ne pas répondre.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		statusColor, statusLabel,
		batch.Label,
		string(batch.Type), completedAt,
		batch.ItemCount,
		batch.SuccessCount,
		batch.FailureCount,
		fcfa(batch.TotalAmount),
		fcfa(batch.CommissionAmount),
		failureWarning(batch),
		time.Now().Year(),
	)

	text := fmt.Sprintf(
		"MynaPay — Batch « %s » %s\n\nBénéficiaires : %d\nRéussis : %d\nÉchoués : %d\nMasse versée : %s\nCommission : %s\n\nConsultez votre espace MynaPay pour le détail.",
		batch.Label, statusLabel,
		batch.ItemCount, batch.SuccessCount, batch.FailureCount,
		fcfa(batch.TotalAmount), fcfa(batch.CommissionAmount),
	)

	n.send(ctx, to, subject, html, text)
}

// WalletRecharged notifie le tenant admin après une recharge wallet.
func (n *Notifier) WalletRecharged(ctx context.Context, tenantID uuid.UUID, amount int64, reference string, newBalance int64) {
	to := n.tenantAdminEmail(tenantID)
	if to == "" {
		return
	}

	subject := fmt.Sprintf("MynaPay — Recharge wallet %s", fcfa(amount))
	date := time.Now().In(time.UTC).Format("02/01/2006 à 15:04 UTC")

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#1A1F2E;padding:28px 36px;text-align:center">
    <span style="font-size:22px;font-weight:800;color:#E4A730;letter-spacing:-0.5px">MynaPay</span>
  </td></tr>
  <tr><td style="background:#0DC98A;padding:16px 36px;text-align:center">
    <span style="font-size:15px;font-weight:700;color:#ffffff">Recharge wallet confirmée</span>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 6px;font-size:32px;font-weight:800;color:#1A1F2E;letter-spacing:-1px">+%s</p>
    <p style="margin:0 0 28px;font-size:13px;color:#6B7280">Créditée le %s</p>
    <table width="100%%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#F9FAFB">
        <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Détail de l&apos;opération</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Référence</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A1F2E;text-align:right;font-family:monospace">%s</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Montant crédité</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0DC98A;text-align:right">+%s</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Solde disponible</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A1F2E;text-align:right">%s</td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6">
      Si vous n&apos;avez pas demandé cette recharge, contactez immédiatement le support MynaPay.
    </p>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:18px 36px;text-align:center;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© %d MynaPay BF · Ce message est automatique, ne pas répondre.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		fcfa(amount), date,
		reference,
		fcfa(amount),
		fcfa(newBalance),
		time.Now().Year(),
	)

	text := fmt.Sprintf(
		"MynaPay — Recharge wallet confirmée\n\nMontant : +%s\nRéférence : %s\nSolde disponible : %s\nDate : %s",
		fcfa(amount), reference, fcfa(newBalance), date,
	)

	n.send(ctx, to, subject, html, text)
}

// TenantActivated notifie le tenant admin que son compte est activé.
func (n *Notifier) TenantActivated(ctx context.Context, tenant *models.Tenant) {
	to := n.tenantAdminEmail(tenant.ID)
	if to == "" {
		return
	}

	subject := "MynaPay — Votre compte est activé"

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#1A1F2E;padding:28px 36px;text-align:center">
    <span style="font-size:22px;font-weight:800;color:#E4A730;letter-spacing:-0.5px">MynaPay</span>
  </td></tr>
  <tr><td style="background:#0DC98A;padding:16px 36px;text-align:center">
    <span style="font-size:15px;font-weight:700;color:#ffffff">Compte activé ✓</span>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1A1F2E">Bienvenue sur MynaPay BF !</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7">
      Votre dossier KYB pour <strong style="color:#1A1F2E">%s</strong> a été validé par notre équipe.
      Votre compte est maintenant actif et vous pouvez effectuer vos virements Mobile Money.
    </p>
    <table width="100%%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:28px">
      <tr style="background:#F9FAFB">
        <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Informations compte</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Entreprise</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A1F2E;text-align:right">%s</td>
      </tr>
      <tr style="border-top:1px solid #E5E7EB;background:#F9FAFB">
        <td style="padding:12px 16px;font-size:13px;color:#374151">Taux de commission</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#E4A730;text-align:right">%.2f%%</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.7">
      Connectez-vous à votre espace pour recharger votre wallet et créer votre premier batch de virements.
    </p>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:18px 36px;text-align:center;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© %d MynaPay BF · Ce message est automatique, ne pas répondre.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		tenant.RaisonSociale,
		tenant.RaisonSociale,
		tenant.CommissionRate*100,
		time.Now().Year(),
	)

	text := fmt.Sprintf(
		"MynaPay — Compte activé\n\nBonjour,\n\nVotre dossier KYB pour %s a été validé. Votre compte MynaPay est maintenant actif.\n\nConnectez-vous pour effectuer vos premiers virements.",
		tenant.RaisonSociale,
	)

	n.send(ctx, to, subject, html, text)
}

// TenantKYBRejected notifie le tenant admin que son dossier KYB a été rejeté.
func (n *Notifier) TenantKYBRejected(ctx context.Context, tenant *models.Tenant, reason string) {
	to := n.tenantAdminEmail(tenant.ID)
	if to == "" {
		return
	}

	subject := "MynaPay — Dossier KYB — compléments requis"

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#1A1F2E;padding:28px 36px;text-align:center">
    <span style="font-size:22px;font-weight:800;color:#E4A730;letter-spacing:-0.5px">MynaPay</span>
  </td></tr>
  <tr><td style="background:#E4A730;padding:16px 36px;text-align:center">
    <span style="font-size:15px;font-weight:700;color:#ffffff">Dossier KYB — action requise</span>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1A1F2E">Compléments requis pour %s</p>
    <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.7">
      Notre équipe a examiné votre dossier KYB et des informations complémentaires sont nécessaires avant l&apos;activation de votre compte.
    </p>
    <div style="background:#FEF9EE;border:1px solid #F3D38A;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#B45309;text-transform:uppercase;letter-spacing:.5px">Motif</p>
      <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6">%s</p>
    </div>
    <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.7">
      Veuillez soumettre les documents ou corrections demandés via votre espace MynaPay. Notre équipe retraitera votre dossier dans les plus brefs délais.
    </p>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:18px 36px;text-align:center;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© %d MynaPay BF · Ce message est automatique, ne pas répondre.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		tenant.RaisonSociale,
		reason,
		time.Now().Year(),
	)

	text := fmt.Sprintf(
		"MynaPay — Dossier KYB — compléments requis\n\nBonjour,\n\nDes informations complémentaires sont requises pour votre dossier KYB (%s).\n\nMotif : %s\n\nVeuillez soumettre les corrections via votre espace MynaPay.",
		tenant.RaisonSociale, reason,
	)

	n.send(ctx, to, subject, html, text)
}

// TenantSuspended notifie le tenant admin que son compte a été suspendu.
func (n *Notifier) TenantSuspended(ctx context.Context, tenant *models.Tenant) {
	to := n.tenantAdminEmail(tenant.ID)
	if to == "" {
		return
	}

	subject := "MynaPay — Votre compte a été suspendu"

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#1A1F2E;padding:28px 36px;text-align:center">
    <span style="font-size:22px;font-weight:800;color:#E4A730;letter-spacing:-0.5px">MynaPay</span>
  </td></tr>
  <tr><td style="background:#F05252;padding:16px 36px;text-align:center">
    <span style="font-size:15px;font-weight:700;color:#ffffff">Compte suspendu</span>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1A1F2E">Votre accès MynaPay a été suspendu</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7">
      Le compte de <strong style="color:#1A1F2E">%s</strong> sur la plateforme MynaPay BF a été temporairement suspendu.
      Vous ne pouvez plus effectuer de virements ni accéder à votre espace.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6">
        Pour toute question concernant cette suspension, veuillez contacter le support MynaPay.
      </p>
    </div>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:18px 36px;text-align:center;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© %d MynaPay BF · Ce message est automatique, ne pas répondre.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
		tenant.RaisonSociale,
		time.Now().Year(),
	)

	text := fmt.Sprintf(
		"MynaPay — Compte suspendu\n\nBonjour,\n\nLe compte de %s sur MynaPay BF a été suspendu. Contactez le support pour plus d'informations.",
		tenant.RaisonSociale,
	)

	n.send(ctx, to, subject, html, text)
}

// ── Helpers ───────────────────────────────────────────────────────

func fcfa(amount int64) string {
	s := fmt.Sprintf("%d", amount)
	n := len(s)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (n-i)%3 == 0 {
			b.WriteRune(' ') // espace insécable
		}
		b.WriteRune(c)
	}
	return b.String() + " F CFA"
}

func failureWarning(batch *models.Batch) string {
	if batch.FailureCount == 0 {
		return ""
	}
	return fmt.Sprintf(
		`<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 18px;margin-bottom:16px">
      <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6">
        <strong>%d virement(s) ont échoué.</strong> Les fonds correspondants ont été remboursés sur votre wallet.
        Consultez le détail du batch pour identifier les numéros concernés.
      </p>
    </div>`,
		batch.FailureCount,
	)
}
