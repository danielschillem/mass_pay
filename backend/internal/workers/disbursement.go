package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/gateway"
	"masspay-bf/internal/services"
)

// Start lance le worker pool et le scheduler de retry.
// Bloquant : appeler dans une goroutine.
func Start(db *gorm.DB, rdb *redis.Client, cfg *config.Config) {
	ws := services.NewWalletService(db)
	bs := services.NewBatchService(db, rdb)

	w := &worker{
		db:  db,
		rdb: rdb,
		cfg: cfg,
		ws:  ws,
		bs:  bs,
	}

	var wg sync.WaitGroup

	// Pool de workers concurrents
	for i := 0; i < cfg.WorkerConcurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			log.Printf("[worker %d] démarré", id)
			w.run(id)
		}(i)
	}

	// Scheduler retry : re-queue les jobs différés
	wg.Add(1)
	go func() {
		defer wg.Done()
		w.retryScheduler()
	}()

	wg.Wait()
}

type worker struct {
	db  *gorm.DB
	rdb *redis.Client
	cfg *config.Config
	ws  *services.WalletService
	bs  *services.BatchService
}

// run est la boucle principale d'un worker — blocking pop Redis.
func (w *worker) run(id int) {
	ctx := context.Background()
	for {
		// BRPOP : bloquant, timeout 5s pour permettre shutdown propre
		result, err := w.rdb.BRPop(ctx, 5*time.Second, services.QueueDisbursement).Result()
		if err == redis.Nil {
			continue // timeout, reboucler
		}
		if err != nil {
			log.Printf("[worker %d] BRPOP error: %v — pause 2s", id, err)
			time.Sleep(2 * time.Second)
			continue
		}

		var job services.DisbursementJob
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("[worker %d] decode error: %v", id, err)
			continue
		}

		if err := w.process(ctx, job); err != nil {
			log.Printf("[worker %d] process error item %s: %v", id, job.BatchItemID, err)
		}
	}
}

// process exécute un virement unitaire.
func (w *worker) process(ctx context.Context, job services.DisbursementJob) error {
	log.Printf("[worker] processing item %s — %s — %d FCFA — attempt %d",
		job.BatchItemID, job.Phone, job.Amount, job.Attempt+1)

	gw := gateway.New(job.Operator, w.cfg)

	resp, err := gw.Send(ctx, gateway.SendRequest{
		Phone:     job.Phone,
		Amount:    job.Amount,
		Reference: job.BatchItemID.String(),
		Label:     job.Label,
	})

	if err == nil && (resp.Status == "success" || resp.Status == "pending") {
		// Succès — mettre à jour l'item
		log.Printf("[worker] SUCCESS item %s — ref opérateur: %s", job.BatchItemID, resp.OperatorRef)
		return w.bs.FinishItem(job.BatchItemID, true, resp.OperatorRef, "")
	}

	// Échec — décider retry ou abandon
	errMsg := "erreur inconnue"
	if err != nil {
		errMsg = err.Error()
	} else if resp != nil {
		errMsg = fmt.Sprintf("status opérateur: %s — %s", resp.Status, resp.Message)
	}

	if job.Attempt < w.cfg.MaxRetries-1 {
		return w.scheduleRetry(ctx, job, errMsg)
	}

	// Échec définitif après max tentatives
	log.Printf("[worker] FAILED DEFINITIVE item %s après %d tentatives: %s",
		job.BatchItemID, job.Attempt+1, errMsg)

	if err := w.bs.FinishItem(job.BatchItemID, false, "", errMsg); err != nil {
		return err
	}
	// Rembourser le montant sur le wallet
	return w.ws.RefundItem(job.TenantID, job.Amount, job.BatchItemID, job.BatchID)
}

// scheduleRetry pousse le job dans la sorted set de retry avec délai exponentiel.
// Délai = RetryDelaySec * 2^attempt (30s, 60s, 120s...)
func (w *worker) scheduleRetry(ctx context.Context, job services.DisbursementJob, reason string) error {
	delaySeconds := float64(w.cfg.RetryDelaySeconds) * math.Pow(2, float64(job.Attempt))
	readyAt := time.Now().Add(time.Duration(delaySeconds) * time.Second)

	job.Attempt++
	data, _ := json.Marshal(job)

	log.Printf("[worker] RETRY item %s — tentative %d dans %.0fs (raison: %s)",
		job.BatchItemID, job.Attempt, delaySeconds, reason)

	return w.bs.RetryItem(job.BatchItemID) // marque comme retrying dans la DB
	// TODO: utiliser rdb.ZAdd(ctx, services.QueueRetry, redis.Z{Score: float64(readyAt.Unix()), Member: data})
	_ = data
	_ = readyAt
	return w.rdb.ZAdd(ctx, services.QueueRetry, redis.Z{
		Score:  float64(readyAt.Unix()),
		Member: string(data),
	}).Err()
}

// retryScheduler tourne toutes les 10 secondes et re-queue les jobs prêts.
func (w *worker) retryScheduler() {
	ctx := context.Background()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		now := float64(time.Now().Unix())

		// Récupérer tous les jobs dont le score (timestamp) <= now
		members, err := w.rdb.ZRangeByScore(ctx, services.QueueRetry, &redis.ZRangeBy{
			Min: "0",
			Max: fmt.Sprintf("%f", now),
		}).Result()
		if err != nil {
			log.Printf("[retry-scheduler] ZRangeByScore error: %v", err)
			continue
		}

		if len(members) == 0 {
			continue
		}

		pipe := w.rdb.Pipeline()
		for _, m := range members {
			pipe.LPush(ctx, services.QueueDisbursement, m)
			pipe.ZRem(ctx, services.QueueRetry, m)
		}
		if _, err := pipe.Exec(ctx); err != nil {
			log.Printf("[retry-scheduler] pipeline error: %v", err)
		} else {
			log.Printf("[retry-scheduler] %d job(s) re-enqueués", len(members))
		}
	}
}
