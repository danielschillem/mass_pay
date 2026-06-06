package services

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"masspay-bf/internal/models"
)

func TestWalletRechargeCreditsBalanceAndRecordsReference(t *testing.T) {
	db := newTestDB(t)
	tenant, wallet, user := createTenantWalletUser(t, db, 0, 0.015)

	updated, reference, err := NewWalletService(db).Recharge(tenant.ID, 5_000, user.ID)
	if err != nil {
		t.Fatalf("recharge wallet: %v", err)
	}

	if updated.AvailableBalance != 5_000 {
		t.Fatalf("returned available balance = %d, want 5000", updated.AvailableBalance)
	}
	if !strings.Contains(reference, "-MYNA-0001") {
		t.Fatalf("reference = %q, want first annual MYNA reference", reference)
	}

	var persisted models.Wallet
	if err := db.First(&persisted, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}
	if persisted.AvailableBalance != 5_000 {
		t.Fatalf("persisted available balance = %d, want 5000", persisted.AvailableBalance)
	}

	assertWalletTxCount(t, db, tenant.ID, models.WalletTxRecharge, 1)
}

func TestWalletReserveAndSettleSuccess(t *testing.T) {
	db := newTestDB(t)
	tenant, wallet, user := createTenantWalletUser(t, db, 100_000, 0.015)
	batchID := uuid.New()
	itemID := uuid.New()

	walletService := NewWalletService(db)
	err := db.Transaction(func(tx *gorm.DB) error {
		return walletService.Reserve(tx, tenant.ID, 10_150, batchID, user.ID)
	})
	if err != nil {
		t.Fatalf("reserve wallet: %v", err)
	}

	if err := walletService.SettleItem(tenant.ID, 10_000, 150, itemID, batchID, true); err != nil {
		t.Fatalf("settle successful item: %v", err)
	}

	var updated models.Wallet
	if err := db.First(&updated, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}

	if updated.AvailableBalance != 89_850 {
		t.Fatalf("available balance = %d, want 89850", updated.AvailableBalance)
	}
	if updated.ReservedBalance != 0 {
		t.Fatalf("reserved balance = %d, want 0", updated.ReservedBalance)
	}
	if updated.TotalDebited != 10_000 {
		t.Fatalf("total debited = %d, want 10000", updated.TotalDebited)
	}
	if updated.TotalCommission != 150 {
		t.Fatalf("total commission = %d, want 150", updated.TotalCommission)
	}

	assertWalletTxCount(t, db, tenant.ID, models.WalletTxBatchDebit, 1)
	assertWalletTxCount(t, db, tenant.ID, models.WalletTxCommission, 1)
}

func TestWalletSettleFailureRefundsAmountAndCommission(t *testing.T) {
	db := newTestDB(t)
	tenant, wallet, user := createTenantWalletUser(t, db, 100_000, 0.015)
	batchID := uuid.New()
	itemID := uuid.New()

	walletService := NewWalletService(db)
	err := db.Transaction(func(tx *gorm.DB) error {
		return walletService.Reserve(tx, tenant.ID, 10_150, batchID, user.ID)
	})
	if err != nil {
		t.Fatalf("reserve wallet: %v", err)
	}

	if err := walletService.SettleItem(tenant.ID, 10_000, 150, itemID, batchID, false); err != nil {
		t.Fatalf("settle failed item: %v", err)
	}

	var updated models.Wallet
	if err := db.First(&updated, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}

	if updated.AvailableBalance != 100_000 {
		t.Fatalf("available balance = %d, want 100000", updated.AvailableBalance)
	}
	if updated.ReservedBalance != 0 {
		t.Fatalf("reserved balance = %d, want 0", updated.ReservedBalance)
	}
	if updated.TotalRefunded != 10_150 {
		t.Fatalf("total refunded = %d, want 10150", updated.TotalRefunded)
	}
	if updated.TotalCommission != 0 {
		t.Fatalf("total commission = %d, want 0", updated.TotalCommission)
	}

	assertWalletTxCount(t, db, tenant.ID, models.WalletTxBatchDebit, 1)
	assertWalletTxCount(t, db, tenant.ID, models.WalletTxRefund, 1)
	assertWalletTxCount(t, db, tenant.ID, models.WalletTxCommission, 0)
}

func TestBatchCreateReservesProvision(t *testing.T) {
	db := newTestDB(t)
	tenant, wallet, user := createTenantWalletUser(t, db, 100_000, 0.015)

	batch, err := NewBatchService(db, nil).Create(tenant.ID, user.ID, CreateBatchRequest{
		Label: "Paie juin",
		Type:  models.BatchTypeSalaire,
		Items: []BatchItemInput{
			{FullName: "Alice Test", PhoneNumber: "70123456", Amount: 10_000},
			{FullName: "Bob Test", PhoneNumber: "60123456", Amount: 20_000},
		},
	})
	if err != nil {
		t.Fatalf("create batch: %v", err)
	}

	if batch.TotalAmount != 30_000 {
		t.Fatalf("total amount = %d, want 30000", batch.TotalAmount)
	}
	if batch.CommissionAmount != 450 {
		t.Fatalf("commission amount = %d, want 450", batch.CommissionAmount)
	}
	if batch.ProvisionAmount != 30_450 {
		t.Fatalf("provision amount = %d, want 30450", batch.ProvisionAmount)
	}
	if len(batch.Items) != 2 {
		t.Fatalf("items count = %d, want 2", len(batch.Items))
	}

	var updated models.Wallet
	if err := db.First(&updated, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}

	if updated.AvailableBalance != 69_550 {
		t.Fatalf("available balance = %d, want 69550", updated.AvailableBalance)
	}
	if updated.ReservedBalance != 30_450 {
		t.Fatalf("reserved balance = %d, want 30450", updated.ReservedBalance)
	}

	assertWalletTxCount(t, db, tenant.ID, models.WalletTxBatchDebit, 1)
}

func TestAllocateItemCommissionKeepsExactBatchTotal(t *testing.T) {
	items := []int64{100, 100}
	totalCommission := int64(3)
	remaining := totalCommission
	var allocated int64

	for i, amount := range items {
		commission := allocateItemCommission(200, totalCommission, amount, remaining, i == len(items)-1)
		remaining -= commission
		allocated += commission
	}

	if allocated != totalCommission {
		t.Fatalf("allocated commission = %d, want %d", allocated, totalCommission)
	}
	if remaining != 0 {
		t.Fatalf("remaining commission = %d, want 0", remaining)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	_ = godotenv.Load("../../../.env", "../../.env", ".env")
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}

	adminDB, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		skipOrFailPostgres(t, "connect postgres", err)
	}

	adminSQL, err := adminDB.DB()
	if err != nil {
		t.Fatalf("postgres pool: %v", err)
	}
	t.Cleanup(func() {
		_ = adminSQL.Close()
	})

	schema := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quotedSchema := `"` + schema + `"`
	if err := adminDB.Exec(fmt.Sprintf("CREATE SCHEMA %s", quotedSchema)).Error; err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		_ = adminDB.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", quotedSchema)).Error
	})

	if err := adminDB.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).Error; err != nil {
		t.Fatalf("create pgcrypto extension: %v", err)
	}

	db, err := gorm.Open(postgres.Open(withSearchPath(dsn, schema)), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect test schema: %v", err)
	}

	testSQL, err := db.DB()
	if err != nil {
		t.Fatalf("test postgres pool: %v", err)
	}
	t.Cleanup(func() {
		_ = testSQL.Close()
	})

	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.User{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.Beneficiary{},
		&models.Batch{},
		&models.BatchItem{},
		&models.KYBDocument{},
		&models.KYBComment{},
		&models.KYBHistory{},
		&models.RefreshToken{},
	); err != nil {
		t.Fatalf("auto migrate test schema: %v", err)
	}

	return db
}

func withSearchPath(dsn, schema string) string {
	if parsed, err := url.Parse(dsn); err == nil && parsed.Scheme != "" {
		query := parsed.Query()
		query.Set("search_path", schema)
		parsed.RawQuery = query.Encode()
		return parsed.String()
	}
	if strings.Contains(dsn, "search_path=") {
		return dsn
	}
	return strings.TrimSpace(dsn) + " search_path=" + schema
}

func skipOrFailPostgres(t *testing.T, action string, err error) {
	t.Helper()
	if os.Getenv("CI") == "" {
		t.Skipf("%s: %v", action, err)
	}
	t.Fatalf("%s: %v", action, err)
}

func createTenantWalletUser(t *testing.T, db *gorm.DB, availableBalance int64, commissionRate float64) (models.Tenant, models.Wallet, models.User) {
	t.Helper()

	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")
	tenant := models.Tenant{
		Slug:                "tenant-" + suffix,
		RaisonSociale:       "Tenant Test",
		RCCM:                "RCCM-" + suffix[:12],
		IFU:                 "IFU-" + suffix[:12],
		Status:              models.TenantStatusActive,
		CommissionRate:      commissionRate,
		ValidationThreshold: 1_000_000,
		BatchAmountLimit:    10_000_000,
	}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	wallet := models.Wallet{
		TenantID:         tenant.ID,
		AvailableBalance: availableBalance,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	user := models.User{
		TenantID:     &tenant.ID,
		Email:        "admin-" + suffix + "@example.test",
		PasswordHash: "hash",
		FirstName:    "Admin",
		LastName:     "Test",
		Role:         models.RoleTenantAdmin,
		IsActive:     true,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	return tenant, wallet, user
}

func assertWalletTxCount(t *testing.T, db *gorm.DB, tenantID uuid.UUID, txType models.WalletTxType, want int64) {
	t.Helper()

	var got int64
	if err := db.WithContext(context.Background()).
		Model(&models.WalletTransaction{}).
		Where("tenant_id = ? AND type = ?", tenantID, txType).
		Count(&got).Error; err != nil {
		t.Fatalf("count wallet tx %s: %v", txType, err)
	}
	if got != want {
		t.Fatalf("wallet tx count for %s = %d, want %d", txType, got, want)
	}
}
