package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"golang.org/x/net/context"
	"masspay-bf/internal/models"
)

const (
	QueueDisbursement = "masspay:queue:disbursement"
	QueueRetry        = "masspay:queue:retry" // sorted set (score = timestamp_ready)
)

// DisbursementJob représente un virement unitaire à exécuter.
type DisbursementJob struct {
	BatchItemID      uuid.UUID       `json:"batch_item_id"`
	TenantID         uuid.UUID       `json:"tenant_id"`
	BatchID          uuid.UUID       `json:"batch_id"`
	OperatorRef      string          `json:"operator_ref,omitempty"`
	Phone            string          `json:"phone"`
	Operator         models.Operator `json:"operator"`
	Amount           int64           `json:"amount"`
	CommissionAmount int64           `json:"commission_amount"`
	Label            string          `json:"label"`
	Attempt          int             `json:"attempt"`
}

// ── Requêtes ──────────────────────────────────────────────────────

type BatchItemInput struct {
	BeneficiaryID *uuid.UUID `json:"beneficiary_id"`
	FullName      string     `json:"full_name" binding:"required"`
	PhoneNumber   string     `json:"phone_number" binding:"required"`
	Amount        int64      `json:"amount" binding:"required,min=100"`
}

type CreateBatchRequest struct {
	Label string           `json:"label" binding:"required,min=3,max=200"`
	Type  models.BatchType `json:"type" binding:"required,oneof=salaire prime commission autre"`
	Items []BatchItemInput `json:"items" binding:"required,min=1,max=5000"`
}

// ── Service ───────────────────────────────────────────────────────

type BatchService struct {
	db     *gorm.DB
	rdb    *redis.Client
	wallet *WalletService
}

func NewBatchService(db *gorm.DB, rdb *redis.Client) *BatchService {
	return &BatchService{
		db:     db,
		rdb:    rdb,
		wallet: NewWalletService(db),
	}
}

// Create crée un batch en brouillon après avoir vérifié la provision.
// Le wallet est débité (réservé) atomiquement dans la même transaction.
func (s *BatchService) Create(tenantID, createdBy uuid.UUID, req CreateBatchRequest) (*models.Batch, error) {
	// Récupérer le tenant pour le taux de commission
	var tenant models.Tenant
	if err := s.db.First(&tenant, "id = ?", tenantID).Error; err != nil {
		return nil, fmt.Errorf("tenant introuvable: %w", err)
	}

	// Construire les items et calculer la masse totale
	var totalAmount int64
	items := make([]models.BatchItem, 0, len(req.Items))

	for _, inp := range req.Items {
		phone := models.NormalizePhone(inp.PhoneNumber)
		op := models.DetectOperator(phone)
		if op == models.OperatorUnknown {
			return nil, fmt.Errorf("numéro non reconnu (opérateur inconnu) : %s", inp.PhoneNumber)
		}

		items = append(items, models.BatchItem{
			TenantID:      tenantID,
			BeneficiaryID: inp.BeneficiaryID,
			FullName:      inp.FullName,
			PhoneNumber:   phone,
			Operator:      op,
			Amount:        inp.Amount,
			Status:        models.ItemStatusPending,
		})
		totalAmount += inp.Amount
	}

	// Calcul commission — arrondi à l'entier inférieur (FCFA)
	commission := int64(float64(totalAmount) * tenant.CommissionRate)
	provision := totalAmount + commission

	// Vérifier le plafond batch
	if provision > tenant.BatchAmountLimit {
		return nil, fmt.Errorf("provision %d FCFA dépasse le plafond tenant %d FCFA",
			provision, tenant.BatchAmountLimit)
	}

	batch := &models.Batch{
		TenantID:         tenantID,
		Label:            req.Label,
		Type:             req.Type,
		Status:           models.BatchStatusDraft,
		TotalAmount:      totalAmount,
		CommissionAmount: commission,
		ProvisionAmount:  provision,
		CommissionRate:   tenant.CommissionRate,
		ItemCount:        len(items),
		CreatedByID:      createdBy,
	}

	// Tout dans une transaction PostgreSQL
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(batch).Error; err != nil {
			return fmt.Errorf("create batch: %w", err)
		}

		// Associer les items au batch
		for i := range items {
			items[i].BatchID = batch.ID
		}
		if err := tx.CreateInBatches(items, 500).Error; err != nil {
			return fmt.Errorf("create items: %w", err)
		}

		// Réserver la provision sur le wallet
		if err := s.wallet.Reserve(tx, tenantID, provision, batch.ID, createdBy); err != nil {
			return err // ErrInsufficientBalance inclus
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// Charger les items pour la réponse
	s.db.Where("batch_id = ?", batch.ID).Find(&batch.Items)
	return batch, nil
}

// Validate marque un batch comme validé (prêt à exécuter).
// Si la provision > seuil de double approbation, le validateur
// doit être différent du créateur.
func (s *BatchService) Validate(batchID, validatedBy uuid.UUID) (*models.Batch, error) {
	var batch models.Batch
	if err := s.db.First(&batch, "id = ?", batchID).Error; err != nil {
		return nil, errors.New("batch introuvable")
	}

	if batch.Status != models.BatchStatusDraft {
		return nil, fmt.Errorf("statut invalide pour validation : %s", batch.Status)
	}

	var tenant models.Tenant
	s.db.First(&tenant, "id = ?", batch.TenantID)

	// Double approbation si provision dépasse le seuil
	if batch.ProvisionAmount >= tenant.ValidationThreshold && batch.CreatedByID == validatedBy {
		return nil, errors.New("double approbation requise : le validateur doit être différent du créateur")
	}

	var validator models.User
	if err := s.db.First(&validator, "id = ?", validatedBy).Error; err != nil {
		return nil, errors.New("utilisateur introuvable")
	}
	if !validator.CanValidateBatch() {
		return nil, errors.New("permissions insuffisantes pour valider")
	}

	now := time.Now()
	batch.Status = models.BatchStatusValidated
	batch.ValidatedByID = &validatedBy
	batch.StartedAt = &now

	if err := s.db.Save(&batch).Error; err != nil {
		return nil, err
	}
	return &batch, nil
}

// Execute bascule un batch en traitement et pousse les jobs dans Redis.
// La commission est réglée par item traité, en conservant exactement le total batch.
func (s *BatchService) Execute(batchID, executedBy uuid.UUID) (*models.Batch, error) {
	var batch models.Batch
	if err := s.db.Preload("Items").First(&batch, "id = ?", batchID).Error; err != nil {
		return nil, errors.New("batch introuvable")
	}

	if batch.Status != models.BatchStatusValidated {
		return nil, fmt.Errorf("statut invalide pour exécution : %s (attendu : validated)", batch.Status)
	}

	var executor models.User
	if err := s.db.First(&executor, "id = ?", executedBy).Error; err != nil {
		return nil, errors.New("utilisateur introuvable")
	}
	if !executor.CanExecuteBatch() {
		return nil, errors.New("permissions insuffisantes pour exécuter")
	}

	ctx := context.Background()

	// Passer en processing — la commission sera prélevée uniquement par item success
	err := s.db.Transaction(func(tx *gorm.DB) error {
		batch.Status = models.BatchStatusProcessing
		batch.ExecutedByID = &executedBy
		return tx.Save(&batch).Error
	})
	if err != nil {
		return nil, fmt.Errorf("commit batch: %w", err)
	}

	// Enqueue chaque item dans Redis — pipeline pour performance
	pipe := s.rdb.Pipeline()
	remainingCommission := batch.CommissionAmount
	for i, item := range batch.Items {
		commissionPerItem := int64(0)
		if batch.TotalAmount > 0 {
			commissionPerItem = item.Amount * batch.CommissionAmount / batch.TotalAmount
		}
		if i == len(batch.Items)-1 {
			commissionPerItem = remainingCommission
		}
		remainingCommission -= commissionPerItem

		job := DisbursementJob{
			BatchItemID:      item.ID,
			TenantID:         batch.TenantID,
			BatchID:          batch.ID,
			Phone:            item.PhoneNumber,
			Operator:         item.Operator,
			Amount:           item.Amount,
			CommissionAmount: commissionPerItem,
			Label:            batch.Label,
			Attempt:          0,
		}
		data, _ := json.Marshal(job)
		pipe.LPush(ctx, QueueDisbursement, data)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		// Les jobs n'ont pas été enqueués : logger et alerter
		// Le batch est en processing, le worker de récupération doit le reprendre
		return &batch, fmt.Errorf("enqueue partiel — batch en processing, vérifier logs: %w", err)
	}

	return &batch, nil
}

// FinishItem met à jour un item après traitement par le worker.
// Vérifie si le batch est entièrement terminé pour le clore.
func (s *BatchService) FinishItem(itemID uuid.UUID, success bool, operatorRef, failureReason string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var item models.BatchItem
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&item, "id = ?", itemID).Error; err != nil {
			return err
		}

		now := time.Now()
		item.ProcessedAt = &now
		item.OperatorRef = operatorRef
		if success {
			item.Status = models.ItemStatusSuccess
		} else {
			item.Status = models.ItemStatusFailed
			item.FailureReason = failureReason
		}
		if err := tx.Save(&item).Error; err != nil {
			return err
		}

		// Incrémenter le compteur du batch
		field := "success_count"
		if !success {
			field = "failure_count"
		}
		if err := tx.Model(&models.Batch{}).Where("id = ?", item.BatchID).
			UpdateColumn(field, gorm.Expr(field+" + 1")).Error; err != nil {
			return err
		}

		// Clore le batch si tous les items sont traités
		var batch models.Batch
		tx.First(&batch, "id = ?", item.BatchID)
		if batch.IsDone() {
			completedAt := time.Now()
			finalStatus := models.BatchStatusCompleted
			if batch.FailureCount == batch.ItemCount {
				finalStatus = models.BatchStatusFailed
			}
			tx.Model(&batch).Updates(map[string]interface{}{
				"status":       finalStatus,
				"completed_at": completedAt,
			})
		}
		return nil
	})
}

// RetryItem incrémente le compteur de tentatives.
func (s *BatchService) RetryItem(itemID uuid.UUID) error {
	return s.db.Model(&models.BatchItem{}).Where("id = ?", itemID).
		UpdateColumns(map[string]interface{}{
			"status":   models.ItemStatusRetrying,
			"attempts": gorm.Expr("attempts + 1"),
		}).Error
}

// GetBatch retourne un batch avec ses items, scoped au tenant.
func (s *BatchService) GetBatch(batchID, tenantID uuid.UUID) (*models.Batch, error) {
	var batch models.Batch
	err := s.db.Preload("Items").
		Where("id = ? AND tenant_id = ?", batchID, tenantID).
		First(&batch).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("batch introuvable")
	}
	return &batch, err
}

// ListBatches retourne les batchs d'un tenant (sans items).
func (s *BatchService) ListBatches(tenantID uuid.UUID, page, pageSize int) ([]models.Batch, int64, error) {
	var batches []models.Batch
	var total int64

	offset := (page - 1) * pageSize
	q := s.db.Model(&models.Batch{}).Where("tenant_id = ? AND deleted_at IS NULL", tenantID)

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := q.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&batches).Error; err != nil {
		return nil, 0, err
	}
	return batches, total, nil
}
