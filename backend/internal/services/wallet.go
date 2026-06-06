package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"masspay-bf/internal/models"
)

var (
	ErrInsufficientBalance = errors.New("solde wallet insuffisant")
	ErrWalletNotFound      = errors.New("wallet introuvable")
)

type WalletService struct {
	db *gorm.DB
}

func NewWalletService(db *gorm.DB) *WalletService {
	return &WalletService{db: db}
}

// GetOrCreate retourne le wallet du tenant, le crée s'il n'existe pas.
func (s *WalletService) GetOrCreate(tenantID uuid.UUID) (*models.Wallet, error) {
	var w models.Wallet
	err := s.db.Where("tenant_id = ?", tenantID).First(&w).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		w = models.Wallet{TenantID: tenantID}
		if err := s.db.Create(&w).Error; err != nil {
			return nil, fmt.Errorf("create wallet: %w", err)
		}
		return &w, nil
	}
	return &w, err
}

// Recharge crédite le wallet. La référence est auto-générée au format
// YYYY-MYNA-XXXX (compteur global annuel), calculée dans la transaction
// pour éviter les doublons sous concurrence.
func (s *WalletService) Recharge(tenantID uuid.UUID, amount int64, byUserID uuid.UUID) (*models.Wallet, string, error) {
	if amount <= 0 {
		return nil, "", errors.New("montant de recharge invalide")
	}

	var wallet models.Wallet
	var reference string

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Compteur annuel global des recharges → référence unique
		var count int64
		if err := tx.Model(&models.WalletTransaction{}).
			Where("type = ?", models.WalletTxRecharge).
			Where("EXTRACT(YEAR FROM created_at) = ?", time.Now().Year()).
			Count(&count).Error; err != nil {
			return err
		}
		reference = fmt.Sprintf("%d-MYNA-%04d", time.Now().Year(), count+1)

		// Lock pour éviter les race conditions sur le solde
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
			return ErrWalletNotFound
		}

		before := wallet.AvailableBalance
		wallet.AvailableBalance += amount

		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		if err := tx.Create(&models.WalletTransaction{
			WalletID:      wallet.ID,
			TenantID:      tenantID,
			Type:          models.WalletTxRecharge,
			Amount:        amount,
			BalanceBefore: before,
			BalanceAfter:  wallet.AvailableBalance,
			Reference:     reference,
			Note:          "recharge manuelle",
			CreatedBy:     byUserID,
		}).Error; err != nil {
			return err
		}
		return nil
	})
	return &wallet, reference, err
}

// Reserve bloque (provision_amount) sur le wallet pour un batch.
// available -= provision, reserved += provision
func (s *WalletService) Reserve(tx *gorm.DB, tenantID uuid.UUID, amount int64, batchID uuid.UUID, byUserID uuid.UUID) error {
	var wallet models.Wallet
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
		return ErrWalletNotFound
	}

	if wallet.AvailableBalance < amount {
		return fmt.Errorf("%w : disponible %d FCFA, requis %d FCFA",
			ErrInsufficientBalance, wallet.AvailableBalance, amount)
	}

	before := wallet.AvailableBalance
	wallet.AvailableBalance -= amount
	wallet.ReservedBalance += amount

	if err := tx.Save(&wallet).Error; err != nil {
		return err
	}

	if err := tx.Create(&models.WalletTransaction{
		WalletID:      wallet.ID,
		TenantID:      tenantID,
		Type:          models.WalletTxBatchDebit,
		Amount:        -amount,
		BalanceBefore: before,
		BalanceAfter:  wallet.AvailableBalance,
		BatchID:       &batchID,
		Note:          "provision batch — fonds bloqués",
		CreatedBy:     byUserID,
	}).Error; err != nil {
		return err
	}
	return nil
}

// SettleItem finalise un item après traitement par l'opérateur.
// - success=true  : déduit (amount + commission) du réservé, enregistre le débit et la commission.
// - success=false : rembourse intégralement (amount + commission) vers le disponible — aucune commission prélevée.
func (s *WalletService) SettleItem(tenantID uuid.UUID, amount, commission int64, itemID, batchID uuid.UUID, success bool) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var wallet models.Wallet
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
			return ErrWalletNotFound
		}

		total := amount + commission
		systemUser := uuid.MustParse("00000000-0000-0000-0000-000000000000")

		if success {
			wallet.ReservedBalance -= total
			wallet.TotalDebited += amount
			wallet.TotalCommission += commission
			if err := tx.Save(&wallet).Error; err != nil {
				return err
			}
			if commission > 0 {
				if err := tx.Create(&models.WalletTransaction{
					WalletID:      wallet.ID,
					TenantID:      tenantID,
					Type:          models.WalletTxCommission,
					Amount:        -commission,
					BalanceBefore: wallet.AvailableBalance,
					BalanceAfter:  wallet.AvailableBalance,
					BatchID:       &batchID,
					Note:          fmt.Sprintf("commission virement réussi item %s", itemID),
					CreatedBy:     systemUser,
				}).Error; err != nil {
					return err
				}
			}
		} else {
			before := wallet.AvailableBalance
			wallet.AvailableBalance += total
			wallet.ReservedBalance -= total
			wallet.TotalRefunded += total
			if err := tx.Save(&wallet).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.WalletTransaction{
				WalletID:      wallet.ID,
				TenantID:      tenantID,
				Type:          models.WalletTxRefund,
				Amount:        total,
				BalanceBefore: before,
				BalanceAfter:  wallet.AvailableBalance,
				BatchID:       &batchID,
				Note:          fmt.Sprintf("remboursement intégral (montant + commission) item échoué %s", itemID),
				CreatedBy:     systemUser,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
