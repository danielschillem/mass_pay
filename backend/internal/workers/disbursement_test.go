package workers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"masspay-bf/internal/config"
	"masspay-bf/internal/gateway"
	"masspay-bf/internal/models"
	"masspay-bf/internal/services"
)

func TestProcessSendsAndSettlesSuccess(t *testing.T) {
	db := newWorkerTestDB(t)
	tenant, wallet, _, batch, item := createWorkerFixture(t, db, 10_000, 150)
	fake := &fakeGateway{
		sendResp: &gateway.SendResponse{
			OperatorRef: "op-success",
			Status:      "success",
			Message:     "ok",
		},
	}
	w := newTestWorker(db, fake)

	if err := w.process(context.Background(), jobFromFixture(tenant, batch, item, 150, "")); err != nil {
		t.Fatalf("process success job: %v", err)
	}

	if fake.sendCalls != 1 {
		t.Fatalf("send calls = %d, want 1", fake.sendCalls)
	}
	if fake.checkCalls != 0 {
		t.Fatalf("check calls = %d, want 0", fake.checkCalls)
	}

	var updatedItem models.BatchItem
	if err := db.First(&updatedItem, "id = ?", item.ID).Error; err != nil {
		t.Fatalf("reload item: %v", err)
	}
	if updatedItem.Status != models.ItemStatusSuccess {
		t.Fatalf("item status = %s, want success", updatedItem.Status)
	}
	if updatedItem.OperatorRef != "op-success" {
		t.Fatalf("item operator ref = %q, want op-success", updatedItem.OperatorRef)
	}

	var updatedBatch models.Batch
	if err := db.First(&updatedBatch, "id = ?", batch.ID).Error; err != nil {
		t.Fatalf("reload batch: %v", err)
	}
	if updatedBatch.SuccessCount != 1 {
		t.Fatalf("batch success count = %d, want 1", updatedBatch.SuccessCount)
	}
	if updatedBatch.Status != models.BatchStatusCompleted {
		t.Fatalf("batch status = %s, want completed", updatedBatch.Status)
	}

	var updatedWallet models.Wallet
	if err := db.First(&updatedWallet, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}
	if updatedWallet.AvailableBalance != 0 {
		t.Fatalf("available balance = %d, want 0", updatedWallet.AvailableBalance)
	}
	if updatedWallet.ReservedBalance != 0 {
		t.Fatalf("reserved balance = %d, want 0", updatedWallet.ReservedBalance)
	}
	if updatedWallet.TotalDebited != 10_000 {
		t.Fatalf("total debited = %d, want 10000", updatedWallet.TotalDebited)
	}
	if updatedWallet.TotalCommission != 150 {
		t.Fatalf("total commission = %d, want 150", updatedWallet.TotalCommission)
	}
	if w.processed.Load() != 1 || w.success.Load() != 1 || w.failed.Load() != 0 {
		t.Fatalf("counters processed/success/failed = %d/%d/%d, want 1/1/0",
			w.processed.Load(), w.success.Load(), w.failed.Load())
	}
}

func TestProcessPendingSchedulesRetryWithOperatorRef(t *testing.T) {
	db := newWorkerTestDB(t)
	tenant, wallet, _, batch, item := createWorkerFixture(t, db, 10_000, 150)
	fake := &fakeGateway{
		sendResp: &gateway.SendResponse{
			OperatorRef: "moov-pending",
			Status:      "pending",
			Message:     "push sent",
		},
	}
	w := newTestWorker(db, fake)

	var retryMember string
	var retryReadyAt time.Time
	w.enqueueRetry = func(_ context.Context, member string, readyAt time.Time) error {
		retryMember = member
		retryReadyAt = readyAt
		return nil
	}

	if err := w.process(context.Background(), jobFromFixture(tenant, batch, item, 150, "")); err != nil {
		t.Fatalf("process pending job: %v", err)
	}

	if fake.sendCalls != 1 {
		t.Fatalf("send calls = %d, want 1", fake.sendCalls)
	}
	if fake.checkCalls != 0 {
		t.Fatalf("check calls = %d, want 0", fake.checkCalls)
	}
	if retryMember == "" {
		t.Fatal("retry member was not enqueued")
	}
	if retryReadyAt.IsZero() {
		t.Fatal("retry ready time was not set")
	}

	var retryJob services.DisbursementJob
	if err := json.Unmarshal([]byte(retryMember), &retryJob); err != nil {
		t.Fatalf("decode retry job: %v", err)
	}
	if retryJob.Attempt != 1 {
		t.Fatalf("retry attempt = %d, want 1", retryJob.Attempt)
	}
	if retryJob.OperatorRef != "moov-pending" {
		t.Fatalf("retry operator ref = %q, want moov-pending", retryJob.OperatorRef)
	}
	if retryJob.BatchItemID != item.ID {
		t.Fatalf("retry item id = %s, want %s", retryJob.BatchItemID, item.ID)
	}

	var updatedItem models.BatchItem
	if err := db.First(&updatedItem, "id = ?", item.ID).Error; err != nil {
		t.Fatalf("reload item: %v", err)
	}
	if updatedItem.Status != models.ItemStatusRetrying {
		t.Fatalf("item status = %s, want retrying", updatedItem.Status)
	}
	if updatedItem.Attempts != 1 {
		t.Fatalf("item attempts = %d, want 1", updatedItem.Attempts)
	}

	var updatedWallet models.Wallet
	if err := db.First(&updatedWallet, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}
	if updatedWallet.AvailableBalance != 0 || updatedWallet.ReservedBalance != 10_150 {
		t.Fatalf("wallet available/reserved = %d/%d, want 0/10150",
			updatedWallet.AvailableBalance, updatedWallet.ReservedBalance)
	}
	if w.processed.Load() != 0 || w.success.Load() != 0 || w.failed.Load() != 0 {
		t.Fatalf("counters processed/success/failed = %d/%d/%d, want 0/0/0",
			w.processed.Load(), w.success.Load(), w.failed.Load())
	}
}

func TestProcessChecksExistingOperatorRefBeforeSettlingSuccess(t *testing.T) {
	db := newWorkerTestDB(t)
	tenant, wallet, _, batch, item := createWorkerFixture(t, db, 10_000, 150)
	fake := &fakeGateway{
		checkResp: &gateway.SendResponse{
			OperatorRef: "moov-final",
			Status:      "success",
			Message:     "confirmed",
		},
	}
	w := newTestWorker(db, fake)

	if err := w.process(context.Background(), jobFromFixture(tenant, batch, item, 150, "moov-pending")); err != nil {
		t.Fatalf("process check-status job: %v", err)
	}

	if fake.sendCalls != 0 {
		t.Fatalf("send calls = %d, want 0", fake.sendCalls)
	}
	if fake.checkCalls != 1 {
		t.Fatalf("check calls = %d, want 1", fake.checkCalls)
	}
	if fake.lastCheckRef != "moov-pending" {
		t.Fatalf("checked operator ref = %q, want moov-pending", fake.lastCheckRef)
	}

	var updatedItem models.BatchItem
	if err := db.First(&updatedItem, "id = ?", item.ID).Error; err != nil {
		t.Fatalf("reload item: %v", err)
	}
	if updatedItem.Status != models.ItemStatusSuccess {
		t.Fatalf("item status = %s, want success", updatedItem.Status)
	}
	if updatedItem.OperatorRef != "moov-final" {
		t.Fatalf("item operator ref = %q, want moov-final", updatedItem.OperatorRef)
	}

	var updatedWallet models.Wallet
	if err := db.First(&updatedWallet, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}
	if updatedWallet.ReservedBalance != 0 {
		t.Fatalf("reserved balance = %d, want 0", updatedWallet.ReservedBalance)
	}
	if updatedWallet.TotalDebited != 10_000 || updatedWallet.TotalCommission != 150 {
		t.Fatalf("wallet debited/commission = %d/%d, want 10000/150",
			updatedWallet.TotalDebited, updatedWallet.TotalCommission)
	}
}

func TestProcessFinalFailureRefundsWallet(t *testing.T) {
	db := newWorkerTestDB(t)
	tenant, wallet, _, batch, item := createWorkerFixture(t, db, 10_000, 150)
	fake := &fakeGateway{
		sendResp: &gateway.SendResponse{
			OperatorRef: "op-failed",
			Status:      "failed",
			Message:     "rejected",
		},
	}
	w := newTestWorker(db, fake)
	w.enqueueRetry = func(context.Context, string, time.Time) error {
		return errors.New("retry should not be scheduled")
	}

	job := jobFromFixture(tenant, batch, item, 150, "")
	job.Attempt = w.cfg.MaxRetries - 1
	if err := w.process(context.Background(), job); err != nil {
		t.Fatalf("process final failure job: %v", err)
	}

	var updatedItem models.BatchItem
	if err := db.First(&updatedItem, "id = ?", item.ID).Error; err != nil {
		t.Fatalf("reload item: %v", err)
	}
	if updatedItem.Status != models.ItemStatusFailed {
		t.Fatalf("item status = %s, want failed", updatedItem.Status)
	}
	if !strings.Contains(updatedItem.FailureReason, "rejected") {
		t.Fatalf("failure reason = %q, want rejected detail", updatedItem.FailureReason)
	}

	var updatedWallet models.Wallet
	if err := db.First(&updatedWallet, "id = ?", wallet.ID).Error; err != nil {
		t.Fatalf("reload wallet: %v", err)
	}
	if updatedWallet.AvailableBalance != 10_150 {
		t.Fatalf("available balance = %d, want 10150", updatedWallet.AvailableBalance)
	}
	if updatedWallet.ReservedBalance != 0 {
		t.Fatalf("reserved balance = %d, want 0", updatedWallet.ReservedBalance)
	}
	if updatedWallet.TotalRefunded != 10_150 {
		t.Fatalf("total refunded = %d, want 10150", updatedWallet.TotalRefunded)
	}
	if w.processed.Load() != 1 || w.success.Load() != 0 || w.failed.Load() != 1 {
		t.Fatalf("counters processed/success/failed = %d/%d/%d, want 1/0/1",
			w.processed.Load(), w.success.Load(), w.failed.Load())
	}
}

type fakeGateway struct {
	sendResp  *gateway.SendResponse
	sendErr   error
	checkResp *gateway.SendResponse
	checkErr  error

	sendCalls    int
	checkCalls   int
	lastSendReq  gateway.SendRequest
	lastCheckRef string
}

func (g *fakeGateway) Send(_ context.Context, req gateway.SendRequest) (*gateway.SendResponse, error) {
	g.sendCalls++
	g.lastSendReq = req
	return g.sendResp, g.sendErr
}

func (g *fakeGateway) CheckStatus(_ context.Context, operatorRef string) (*gateway.SendResponse, error) {
	g.checkCalls++
	g.lastCheckRef = operatorRef
	return g.checkResp, g.checkErr
}

func (g *fakeGateway) Operator() models.Operator {
	return models.OperatorMoov
}

func newTestWorker(db *gorm.DB, fake gateway.Gateway) *worker {
	log := logrus.New()
	log.SetOutput(io.Discard)

	var processed atomic.Int64
	var failed atomic.Int64
	var success atomic.Int64

	return &worker{
		db:        db,
		cfg:       &config.Config{MaxRetries: 3, RetryDelaySeconds: 1},
		log:       log,
		ws:        services.NewWalletService(db),
		bs:        services.NewBatchService(db, nil),
		processed: &processed,
		failed:    &failed,
		success:   &success,
		gatewayFactory: func(models.Operator, *config.Config) gateway.Gateway {
			return fake
		},
	}
}

func jobFromFixture(tenant models.Tenant, batch models.Batch, item models.BatchItem, commission int64, operatorRef string) services.DisbursementJob {
	return services.DisbursementJob{
		BatchItemID:      item.ID,
		TenantID:         tenant.ID,
		BatchID:          batch.ID,
		OperatorRef:      operatorRef,
		Phone:            item.PhoneNumber,
		Operator:         item.Operator,
		Amount:           item.Amount,
		CommissionAmount: commission,
		Label:            batch.Label,
	}
}

func createWorkerFixture(t *testing.T, db *gorm.DB, amount, commission int64) (models.Tenant, models.Wallet, models.User, models.Batch, models.BatchItem) {
	t.Helper()

	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")
	tenant := models.Tenant{
		Slug:                "worker-tenant-" + suffix,
		RaisonSociale:       "Worker Tenant",
		RCCM:                "RCCM-" + suffix[:12],
		IFU:                 "IFU-" + suffix[:12],
		Status:              models.TenantStatusActive,
		CommissionRate:      0.015,
		ValidationThreshold: 1_000_000,
		BatchAmountLimit:    10_000_000,
	}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	user := models.User{
		TenantID:     &tenant.ID,
		Email:        "worker-admin-" + suffix + "@example.test",
		PasswordHash: "hash",
		FirstName:    "Worker",
		LastName:     "Admin",
		Role:         models.RoleTenantAdmin,
		IsActive:     true,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	wallet := models.Wallet{
		TenantID:        tenant.ID,
		ReservedBalance: amount + commission,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	batch := models.Batch{
		TenantID:         tenant.ID,
		Label:            "Worker batch",
		Type:             models.BatchTypeSalaire,
		Status:           models.BatchStatusProcessing,
		TotalAmount:      amount,
		CommissionAmount: commission,
		ProvisionAmount:  amount + commission,
		CommissionRate:   0.015,
		ItemCount:        1,
		CreatedByID:      user.ID,
	}
	if err := db.Create(&batch).Error; err != nil {
		t.Fatalf("create batch: %v", err)
	}

	item := models.BatchItem{
		BatchID:     batch.ID,
		TenantID:    tenant.ID,
		FullName:    "Worker Beneficiary",
		PhoneNumber: "22670123456",
		Operator:    models.OperatorMoov,
		Amount:      amount,
		Status:      models.ItemStatusPending,
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("create batch item: %v", err)
	}

	return tenant, wallet, user, batch, item
}

func newWorkerTestDB(t *testing.T) *gorm.DB {
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
		skipOrFailWorkerPostgres(t, "connect postgres", err)
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

	db, err := gorm.Open(postgres.Open(withWorkerSearchPath(dsn, schema)), &gorm.Config{
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

func withWorkerSearchPath(dsn, schema string) string {
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

func skipOrFailWorkerPostgres(t *testing.T, action string, err error) {
	t.Helper()
	if os.Getenv("CI") == "" {
		t.Skipf("%s: %v", action, err)
	}
	t.Fatalf("%s: %v", action, err)
}
