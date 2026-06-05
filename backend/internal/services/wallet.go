package services

import (
	"errors"
	"fmt"

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

// Recharge crédite le wallet. Opération simple, initiée manuellement
// après confirmation de virement bancaire ou dépôt mobile.
func (s *WalletService) Recharge(tenantID uuid.UUID, amount int64, reference string, byUserID uuid.UUID) (*models.Wallet, error) {
	if amount <= 0 {
		return nil, errors.New("montant de recharge invalide")
	}

	var wallet models.Wallet
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Lock pour éviter les race conditions
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
			return ErrWalletNotFound
		}

		before := wallet.AvailableBalance
		wallet.AvailableBalance += amount

		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		// Journal
		tx.Create(&models.WalletTransaction{
			WalletID:      wallet.ID,
			TenantID:      tenantID,
			Type:          models.WalletTxRecharge,
			Amount:        amount,
			BalanceBefore: before,
			BalanceAfter:  wallet.AvailableBalance,
			Reference:     reference,
			Note:          "recharge manuelle",
			CreatedBy:     byUserID,
		})
		return nil
	})
	return &wallet, err
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

	tx.Create(&models.WalletTransaction{
		WalletID:      wallet.ID,
		TenantID:      tenantID,
		Type:          models.WalletTxBatchDebit,
		Amount:        -amount,
		BalanceBefore: before,
		BalanceAfter:  wallet.AvailableBalance,
		BatchID:       &batchID,
		Note:          "provision batch — fonds bloqués",
		CreatedBy:     byUserID,
	})
	return nil
}

// CommitBatch finalise la provision : reserved -= provision, commission enregistrée.
// Les fonds partent effectivement vers les bénéficiaires.
func (s *WalletService) CommitBatch(tx *gorm.DB, tenantID uuid.UUID, totalAmount, commission int64, batchID uuid.UUID) error {
	var wallet models.Wallet
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
		return ErrWalletNotFound
	}

	provision := totalAmount + commission
	wallet.ReservedBalance -= provision
	wallet.TotalDebited += totalAmount
	wallet.TotalCommission += commission

	return tx.Save(&wallet).Error
}

// RefundItem rembourse un virement échoué sur le wallet disponible.
func (s *WalletService) RefundItem(tenantID uuid.UUID, amount int64, itemID uuid.UUID, batchID uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var wallet models.Wallet
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("tenant_id = ?", tenantID).First(&wallet).Error; err != nil {
			return ErrWalletNotFound
		}

		before := wallet.AvailableBalance
		wallet.AvailableBalance += amount
		wallet.ReservedBalance -= amount
		wallet.TotalRefunded += amount

		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		systemUser := uuid.MustParse("00000000-0000-0000-0000-000000000000")
		tx.Create(&models.WalletTransaction{
			WalletID:      wallet.ID,
			TenantID:      tenantID,
			Type:          models.WalletTxRefund,
			Amount:        amount,
			BalanceBefore: before,
			BalanceAfter:  wallet.AvailableBalance,
			BatchID:       &batchID,
			Note:          fmt.Sprintf("remboursement virement échoué item %s", itemID),
			CreatedBy:     systemUser,
		})
		return nil
	})
}
