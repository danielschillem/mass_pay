package models

import (
	"crypto/rand"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"masspay-bf/internal/crypto"
)

// ── Enumerations ──────────────────────────────────────────────────

type TenantStatus string

const (
	TenantStatusProspect   TenantStatus = "prospect"
	TenantStatusKYBPending TenantStatus = "kyb_pending"
	TenantStatusActive     TenantStatus = "active"
	TenantStatusSuspended  TenantStatus = "suspended"
)

type UserRole string

const (
	RoleSuperAdmin    UserRole = "super_admin"
	RoleTenantAdmin   UserRole = "tenant_admin"
	RoleTenantManager UserRole = "tenant_manager"
	RoleTenantAuditor UserRole = "tenant_auditor"
)

type Operator string

const (
	OperatorOrange  Operator = "orange"
	OperatorMoov    Operator = "moov"
	OperatorUnknown Operator = "unknown"
)

type BatchType string

const (
	BatchTypeSalaire    BatchType = "salaire"
	BatchTypePrime      BatchType = "prime"
	BatchTypeCommission BatchType = "commission"
	BatchTypeAutre      BatchType = "autre"
)

type BatchStatus string

const (
	BatchStatusDraft      BatchStatus = "draft"
	BatchStatusValidated  BatchStatus = "validated"
	BatchStatusProcessing BatchStatus = "processing"
	BatchStatusCompleted  BatchStatus = "completed"
	BatchStatusFailed     BatchStatus = "failed"
)

type ItemStatus string

const (
	ItemStatusPending  ItemStatus = "pending"
	ItemStatusSuccess  ItemStatus = "success"
	ItemStatusFailed   ItemStatus = "failed"
	ItemStatusRetrying ItemStatus = "retrying"
)

type WalletTxType string

const (
	WalletTxRecharge   WalletTxType = "recharge"
	WalletTxBatchDebit WalletTxType = "batch_debit"
	WalletTxRefund     WalletTxType = "refund"
	WalletTxCommission WalletTxType = "commission"
)

// ── Tenant ────────────────────────────────────────────────────────

type Tenant struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Slug          string    `gorm:"uniqueIndex;size:100;not null" json:"slug"`
	RaisonSociale string    `gorm:"size:200;not null" json:"raison_sociale"`
	// RCCM et IFU chiffrés AES-256-GCM au repos
	RCCM string `gorm:"size:500;not null" json:"rccm"`
	IFU  string `gorm:"size:500;not null" json:"ifu"`
	// IFUHash : HMAC-SHA-256 de l'IFU — porte l'index unique (l'IFU chiffré n'est pas déterministe)
	IFUHash string       `gorm:"uniqueIndex;size:64" json:"-"`
	Secteur string       `gorm:"size:100" json:"secteur"`
	Status  TenantStatus `gorm:"type:varchar(20);default:'prospect'" json:"status"`
	// Taux de commission — overridable par tenant (défaut global = 1.5%)
	CommissionRate float64 `gorm:"default:0.015;not null" json:"commission_rate"`
	// Seuil de double approbation en FCFA
	ValidationThreshold int64 `gorm:"default:500000" json:"validation_threshold"`
	// Plafond par batch
	BatchAmountLimit int64          `gorm:"default:100000000" json:"batch_amount_limit"`
	CreatedByID      *uuid.UUID     `gorm:"type:uuid" json:"created_by_id,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`

	Wallet        *Wallet       `gorm:"foreignKey:TenantID" json:"wallet,omitempty"`
	Users         []User        `gorm:"foreignKey:TenantID" json:"-"`
	Beneficiaries []Beneficiary `gorm:"foreignKey:TenantID" json:"-"`
	Batches       []Batch       `gorm:"foreignKey:TenantID" json:"-"`
}

// ── User ──────────────────────────────────────────────────────────

type User struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	// nil pour super_admin
	TenantID     *uuid.UUID `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	Email        string     `gorm:"uniqueIndex;size:200;not null" json:"email"`
	PasswordHash string     `gorm:"not null" json:"-"`
	FirstName    string     `gorm:"size:100" json:"first_name"`
	LastName     string     `gorm:"size:100" json:"last_name"`
	Role         UserRole   `gorm:"type:varchar(30);not null" json:"role"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	// 2FA TOTP — secret chiffré AES-256, activé après confirmation
	TOTPSecret  string         `gorm:"size:500" json:"-"`
	TOTPEnabled bool           `gorm:"default:false" json:"totp_enabled"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"-"`
}

func (u *User) FullName() string {
	return strings.TrimSpace(u.FirstName + " " + u.LastName)
}

func (u *User) CanValidateBatch() bool {
	return u.Role == RoleTenantAdmin || u.Role == RoleSuperAdmin
}

// ── RefreshToken ───────────────────────────────────────────────────

type RefreshToken struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"user_id"`
	TokenHash string     `gorm:"not null" json:"-"`
	ExpiresAt time.Time  `gorm:"not null" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UserAgent string     `gorm:"size:500" json:"-"`
	IPAddress string     `gorm:"size:45" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

func GenerateRefreshToken() (string, string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", "", err
	}
	token := fmt.Sprintf("%x", tokenBytes)
	hash, err := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
	if err != nil {
		return "", "", err
	}
	return token, string(hash), nil
}

func (u *User) CanExecuteBatch() bool {
	return u.Role == RoleTenantAdmin || u.Role == RoleSuperAdmin
}

// ── Wallet ────────────────────────────────────────────────────────

type Wallet struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"tenant_id"`
	// Solde liquide disponible — ce que le commanditaire peut utiliser
	AvailableBalance int64 `gorm:"default:0;not null" json:"available_balance"`
	// Montants bloqués par des batchs en attente d'exécution
	ReservedBalance int64 `gorm:"default:0;not null" json:"reserved_balance"`
	// Cumulatifs historiques
	TotalDebited    int64     `gorm:"default:0;not null" json:"total_debited"`
	TotalCommission int64     `gorm:"default:0;not null" json:"total_commission"`
	TotalRefunded   int64     `gorm:"default:0;not null" json:"total_refunded"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	Tenant       Tenant              `gorm:"foreignKey:TenantID" json:"-"`
	Transactions []WalletTransaction `gorm:"foreignKey:WalletID" json:"-"`
}

// TotalBalance = disponible + réservé
func (w *Wallet) TotalBalance() int64 {
	return w.AvailableBalance + w.ReservedBalance
}

type WalletTransaction struct {
	ID       uuid.UUID    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WalletID uuid.UUID    `gorm:"type:uuid;index;not null" json:"wallet_id"`
	TenantID uuid.UUID    `gorm:"type:uuid;index;not null" json:"tenant_id"`
	Type     WalletTxType `gorm:"type:varchar(30);not null" json:"type"`
	// Positif = crédit, négatif = débit
	Amount        int64      `gorm:"not null" json:"amount"`
	BalanceBefore int64      `gorm:"not null" json:"balance_before"`
	BalanceAfter  int64      `gorm:"not null" json:"balance_after"`
	Reference     string     `gorm:"size:200" json:"reference"`
	BatchID       *uuid.UUID `gorm:"type:uuid;index" json:"batch_id,omitempty"`
	Note          string     `gorm:"size:500" json:"note"`
	CreatedBy     uuid.UUID  `gorm:"type:uuid" json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
}

// ── Beneficiary ───────────────────────────────────────────────────

type Beneficiary struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_tenant_phone_hash;not null" json:"tenant_id"`
	// Numéro chiffré AES-256-GCM au repos
	PhoneNumber string `gorm:"size:500;not null" json:"phone_number"`
	// PhoneHash : HMAC-SHA-256 du numéro normalisé — porte l'index unique composite
	PhoneHash     string   `gorm:"size:64;uniqueIndex:idx_tenant_phone_hash" json:"-"`
	FullName      string   `gorm:"size:200;not null" json:"full_name"`
	Operator      Operator `gorm:"type:varchar(20);not null" json:"operator"`
	GroupName     string   `gorm:"size:100" json:"group_name"`
	DefaultAmount int64    `gorm:"default:0" json:"default_amount"`
	IsActive      bool     `gorm:"default:true" json:"is_active"`
	// Référence ERP externe (matricule, ID paie...)
	ExternalRef string         `gorm:"size:100" json:"external_ref"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	Tenant Tenant `gorm:"foreignKey:TenantID" json:"-"`
}

// ── Batch ─────────────────────────────────────────────────────────

type Batch struct {
	ID       uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID uuid.UUID   `gorm:"type:uuid;index;not null" json:"tenant_id"`
	Label    string      `gorm:"size:200;not null" json:"label"`
	Type     BatchType   `gorm:"type:varchar(30);not null" json:"type"`
	Status   BatchStatus `gorm:"type:varchar(30);default:'draft'" json:"status"`
	// Montants en FCFA (entiers)
	TotalAmount      int64 `gorm:"not null" json:"total_amount"`
	CommissionAmount int64 `gorm:"not null" json:"commission_amount"`
	ProvisionAmount  int64 `gorm:"not null" json:"provision_amount"` // total + commission
	// Snapshot du taux au moment de la création
	CommissionRate float64 `gorm:"not null" json:"commission_rate"`
	ItemCount      int     `gorm:"not null" json:"item_count"`
	SuccessCount   int     `gorm:"default:0" json:"success_count"`
	FailureCount   int     `gorm:"default:0" json:"failure_count"`
	// Workflow
	CreatedByID   uuid.UUID      `gorm:"type:uuid;not null" json:"created_by_id"`
	ValidatedByID *uuid.UUID     `gorm:"type:uuid" json:"validated_by_id,omitempty"`
	ExecutedByID  *uuid.UUID     `gorm:"type:uuid" json:"executed_by_id,omitempty"`
	StartedAt     *time.Time     `json:"started_at,omitempty"`
	CompletedAt   *time.Time     `json:"completed_at,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	Tenant    Tenant      `gorm:"foreignKey:TenantID" json:"-"`
	Items     []BatchItem `gorm:"foreignKey:BatchID" json:"items,omitempty"`
	CreatedBy User        `gorm:"foreignKey:CreatedByID" json:"-"`
}

func (b *Batch) IsTerminal() bool {
	return b.Status == BatchStatusCompleted || b.Status == BatchStatusFailed
}

func (b *Batch) IsDone() bool {
	return b.SuccessCount+b.FailureCount >= b.ItemCount
}

// ── BatchItem ─────────────────────────────────────────────────────

type BatchItem struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	BatchID       uuid.UUID  `gorm:"type:uuid;index;not null" json:"batch_id"`
	TenantID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"tenant_id"`
	BeneficiaryID *uuid.UUID `gorm:"type:uuid;index" json:"beneficiary_id,omitempty"`
	FullName      string     `gorm:"size:200;not null" json:"full_name"`
	PhoneNumber   string     `gorm:"size:20;not null" json:"phone_number"`
	Operator      Operator   `gorm:"type:varchar(20);not null" json:"operator"`
	Amount        int64      `gorm:"not null" json:"amount"`
	Status        ItemStatus `gorm:"type:varchar(20);default:'pending'" json:"status"`
	Attempts      int        `gorm:"default:0" json:"attempts"`
	// Référence transaction opérateur (Orange/Moov)
	OperatorRef   string     `gorm:"size:200" json:"operator_ref,omitempty"`
	FailureReason string     `gorm:"size:500" json:"failure_reason,omitempty"`
	ProcessedAt   *time.Time `json:"processed_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`

	Batch Batch `gorm:"foreignKey:BatchID" json:"-"`
}

// ── KYB Document ──────────────────────────────────────────────────

type KYBDocumentType string

const (
	KYBDocRCCM          KYBDocumentType = "rccm"
	KYBDocIFU           KYBDocumentType = "ifu"
	KYBDocIDCard        KYBDocumentType = "id_card"
	KYBDocTaxStamp      KYBDocumentType = "tax_stamp"
	KYBDocBankStatement KYBDocumentType = "bank_statement"
	KYBDocOther         KYBDocumentType = "other"
)

type KYBDocumentStatus string

const (
	KYBDocPending  KYBDocumentStatus = "pending"
	KYBDocApproved KYBDocumentStatus = "approved"
	KYBDocRejected KYBDocumentStatus = "rejected"
)

type KYBDocument struct {
	ID           uuid.UUID         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID         `gorm:"type:uuid;index;not null" json:"tenant_id"`
	Type         KYBDocumentType   `gorm:"type:varchar(30);not null" json:"type"`
	OriginalName string            `gorm:"size:255;not null" json:"original_name"`
	FilePath     string            `gorm:"size:500;not null" json:"file_path"`
	MimeType     string            `gorm:"size:100" json:"mime_type"`
	FileSize     int64             `json:"file_size"`
	Status       KYBDocumentStatus `gorm:"type:varchar(20);default:'pending'" json:"status"`
	ReviewNote   string            `gorm:"size:500" json:"review_note,omitempty"`
	UploadedBy   uuid.UUID         `gorm:"type:uuid" json:"uploaded_by"`
	ReviewedBy   *uuid.UUID        `gorm:"type:uuid" json:"reviewed_by,omitempty"`
	ReviewedAt   *time.Time        `json:"reviewed_at,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID" json:"-"`
}

// ── KYB Comment ───────────────────────────────────────────────────

type KYBComment struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  uuid.UUID `gorm:"type:uuid;index;not null" json:"tenant_id"`
	Comment   string    `gorm:"size:1000;not null" json:"comment"`
	CreatedBy uuid.UUID `gorm:"type:uuid" json:"created_by"`
	CreatedAt time.Time `json:"created_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID" json:"-"`
}

// ── KYB History ───────────────────────────────────────────────────

type KYBHistory struct {
	ID        uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  uuid.UUID     `gorm:"type:uuid;index;not null" json:"tenant_id"`
	Action    string        `gorm:"size:50;not null" json:"action"`
	OldStatus *TenantStatus `gorm:"type:varchar(20)" json:"old_status,omitempty"`
	NewStatus *TenantStatus `gorm:"type:varchar(20)" json:"new_status,omitempty"`
	Comment   string        `gorm:"size:500" json:"comment,omitempty"`
	CreatedBy uuid.UUID     `gorm:"type:uuid" json:"created_by"`
	CreatedAt time.Time     `json:"created_at"`
}

// ── Helpers ───────────────────────────────────────────────────────

// DetectOperator détecte l'opérateur BF à partir du numéro normalisé.
// Numéro attendu : 226XXXXXXXX ou 0XXXXXXXX ou XXXXXXXX (8 chiffres)
func DetectOperator(phone string) Operator {
	// Nettoyage : supprimer espaces, tirets, +, indicatif 226
	cleaned := normalizePhone(phone)
	if len(cleaned) < 8 {
		return OperatorUnknown
	}
	// Récupérer les 2 premiers chiffres locaux
	local := cleaned
	if len(local) == 11 && strings.HasPrefix(local, "226") {
		local = local[3:] // retirer indicatif 226
	}
	if len(local) < 8 {
		return OperatorUnknown
	}
	prefix2 := local[:2]

	// Orange BF : 07x, 77, 78, 79
	orangePrefixes := map[string]bool{
		"70": true, "71": true, "72": true, "73": true,
		"74": true, "75": true, "77": true, "78": true, "79": true,
	}
	// Moov Africa BF (Telmob) : 60-69, 76, 01, 02, 20, 56, 57
	moovPrefixes := map[string]bool{
		"60": true, "61": true, "62": true, "63": true,
		"65": true, "66": true, "67": true, "68": true, "69": true,
		"76": true, "01": true, "02": true, "20": true,
	}

	if orangePrefixes[prefix2] {
		return OperatorOrange
	}
	if moovPrefixes[prefix2] {
		return OperatorMoov
	}
	return OperatorUnknown
}

// NormalizePhone retourne le numéro au format 22670XXXXXX
func NormalizePhone(phone string) string {
	cleaned := normalizePhone(phone)
	if len(cleaned) == 8 {
		return "226" + cleaned
	}
	return cleaned
}

func normalizePhone(phone string) string {
	var b strings.Builder
	for _, r := range phone {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ── Hooks GORM : chiffrement des champs sensibles ─────────────────

// Tenant — chiffrement IFU et RCCM

func (t *Tenant) protectSensitiveFields() {
	if t.IFU != "" {
		t.IFUHash = crypto.HashField(t.IFU)
		t.IFU = crypto.EncryptField(t.IFU)
	}
	if t.RCCM != "" {
		t.RCCM = crypto.EncryptField(t.RCCM)
	}
}

func (t *Tenant) BeforeCreate(tx *gorm.DB) error {
	t.protectSensitiveFields()
	return nil
}

func (t *Tenant) BeforeUpdate(tx *gorm.DB) error {
	t.protectSensitiveFields()
	return nil
}

func (t *Tenant) AfterSave(tx *gorm.DB) error {
	return t.AfterFind(tx)
}

func (t *Tenant) AfterFind(tx *gorm.DB) error {
	t.IFU = crypto.DecryptField(t.IFU)
	t.RCCM = crypto.DecryptField(t.RCCM)
	return nil
}

// Beneficiary — chiffrement numéro de téléphone

func (b *Beneficiary) protectSensitiveFields() {
	if b.PhoneNumber != "" {
		b.PhoneHash = crypto.HashField(b.PhoneNumber)
		b.PhoneNumber = crypto.EncryptField(b.PhoneNumber)
	}
}

func (b *Beneficiary) BeforeCreate(tx *gorm.DB) error {
	b.protectSensitiveFields()
	return nil
}

func (b *Beneficiary) BeforeUpdate(tx *gorm.DB) error {
	b.protectSensitiveFields()
	return nil
}

func (b *Beneficiary) AfterSave(tx *gorm.DB) error {
	return b.AfterFind(tx)
}

func (b *Beneficiary) AfterFind(tx *gorm.DB) error {
	b.PhoneNumber = crypto.DecryptField(b.PhoneNumber)
	return nil
}
