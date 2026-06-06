package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"masspay-bf/internal/config"
	"masspay-bf/internal/gateway"
	"masspay-bf/internal/handlers"
	"masspay-bf/internal/models"
	"masspay-bf/internal/services"
)

// Start lance le worker pool et le scheduler de retry.
// Retourne une fonction de statut pour le monitoring.
func Start(db *gorm.DB, rdb *redis.Client, cfg *config.Config, log *logrus.Logger) handlers.WorkerStatusFunc {
	ws := services.NewWalletService(db)
	bs := services.NewBatchService(db, rdb)

	var (
		processed atomic.Int64
		failed    atomic.Int64
		success   atomic.Int64
	)

	w := &worker{
		db:        db,
		rdb:       rdb,
		cfg:       cfg,
		log:       log,
		ws:        ws,
		bs:        bs,
		processed: &processed,
		failed:    &failed,
		success:   &success,
		running:   true,
	}

	var wg sync.WaitGroup

	// Pool de workers concurrents
	for i := 0; i < cfg.WorkerConcurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			log.WithField("worker_id", id).Info("worker démarré")
			w.run(id)
		}(i)
	}

	// Scheduler retry : re-queue les jobs différés
	wg.Add(1)
	go func() {
		defer wg.Done()
		w.retryScheduler()
	}()

	// Retourne une fonction de statut pour le monitoring
	return func() map[string]interface{} {
		return map[string]interface{}{
			"status":      "running",
			"processed":   processed.Load(),
			"success":     success.Load(),
			"failed":      failed.Load(),
			"concurrency": cfg.WorkerConcurrency,
			"queues": map[string]interface{}{
				"disbursement": rdb.LLen(context.Background(), services.QueueDisbursement).Val(),
				"retry":        rdb.ZCard(context.Background(), services.QueueRetry).Val(),
			},
		}
	}
}

type worker struct {
	db        *gorm.DB
	rdb       *redis.Client
	cfg       *config.Config
	log       *logrus.Logger
	ws        *services.WalletService
	bs        *services.BatchService
	processed *atomic.Int64
	failed    *atomic.Int64
	success   *atomic.Int64
	running   bool

	gatewayFactory func(models.Operator, *config.Config) gateway.Gateway
	enqueueRetry   func(context.Context, string, time.Time) error
}

func (w *worker) run(id int) {
	ctx := context.Background()
	for {
		result, err := w.rdb.BRPop(ctx, 5*time.Second, services.QueueDisbursement).Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			w.log.WithField("worker_id", id).Errorf("BRPOP error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		var job services.DisbursementJob
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			w.log.WithField("worker_id", id).Errorf("decode error: %v", err)
			continue
		}

		if err := w.process(ctx, job); err != nil {
			w.log.WithFields(logrus.Fields{
				"worker_id": id,
				"item_id":   job.BatchItemID,
			}).Errorf("process error: %v", err)
		}
	}
}

func (w *worker) process(ctx context.Context, job services.DisbursementJob) error {
	w.log.WithFields(logrus.Fields{
		"item_id": job.BatchItemID,
		"phone":   job.Phone,
		"amount":  job.Amount,
		"attempt": job.Attempt + 1,
	}).Info("processing item")

	gw := w.newGateway(job.Operator)

	var resp *gateway.SendResponse
	var err error
	if job.OperatorRef != "" {
		resp, err = gw.CheckStatus(ctx, job.OperatorRef)
	} else {
		resp, err = gw.Send(ctx, gateway.SendRequest{
			Phone:     job.Phone,
			Amount:    job.Amount,
			Reference: job.BatchItemID.String(),
			Label:     job.Label,
		})
	}

	if err == nil && resp != nil {
		if resp.OperatorRef != "" {
			job.OperatorRef = resp.OperatorRef
		}

		switch resp.Status {
		case "success":
			w.processed.Add(1)
			w.success.Add(1)
			w.log.WithFields(logrus.Fields{
				"item_id": job.BatchItemID,
				"ref":     job.OperatorRef,
			}).Info("item traité avec succès")
			if err := w.bs.FinishItem(job.BatchItemID, true, job.OperatorRef, ""); err != nil {
				return err
			}
			return w.ws.SettleItem(job.TenantID, job.Amount, job.CommissionAmount, job.BatchItemID, job.BatchID, true)
		case "pending":
			if job.Attempt < w.cfg.MaxRetries-1 {
				reason := fmt.Sprintf("status opérateur: pending — %s", resp.Message)
				w.log.WithFields(logrus.Fields{
					"item_id": job.BatchItemID,
					"ref":     job.OperatorRef,
				}).Info("item en attente opérateur")
				return w.scheduleRetry(ctx, job, reason)
			}
		}
	}

	errMsg := "erreur inconnue"
	if err != nil {
		errMsg = err.Error()
	} else if resp != nil {
		errMsg = fmt.Sprintf("status opérateur: %s — %s", resp.Status, resp.Message)
	}

	if job.Attempt < w.cfg.MaxRetries-1 {
		return w.scheduleRetry(ctx, job, errMsg)
	}

	w.processed.Add(1)
	w.failed.Add(1)
	w.log.WithFields(logrus.Fields{
		"item_id": job.BatchItemID,
		"attempt": job.Attempt + 1,
	}).Errorf("échec définitif: %s", errMsg)

	if err := w.bs.FinishItem(job.BatchItemID, false, "", errMsg); err != nil {
		return err
	}
	return w.ws.SettleItem(job.TenantID, job.Amount, job.CommissionAmount, job.BatchItemID, job.BatchID, false)
}

func (w *worker) scheduleRetry(ctx context.Context, job services.DisbursementJob, reason string) error {
	delaySeconds := float64(w.cfg.RetryDelaySeconds) * math.Pow(2, float64(job.Attempt))
	readyAt := time.Now().Add(time.Duration(delaySeconds) * time.Second)

	job.Attempt++
	data, _ := json.Marshal(job)

	w.log.WithFields(logrus.Fields{
		"item_id": job.BatchItemID,
		"attempt": job.Attempt,
		"delay_s": delaySeconds,
		"reason":  reason,
	}).Info("renvoi programmé")

	if err := w.bs.RetryItem(job.BatchItemID); err != nil {
		return err
	}
	if w.enqueueRetry != nil {
		return w.enqueueRetry(ctx, string(data), readyAt)
	}

	return w.rdb.ZAdd(ctx, services.QueueRetry, redis.Z{
		Score:  float64(readyAt.Unix()),
		Member: string(data),
	}).Err()
}

func (w *worker) newGateway(op models.Operator) gateway.Gateway {
	if w.gatewayFactory != nil {
		return w.gatewayFactory(op, w.cfg)
	}
	return gateway.New(op, w.cfg)
}

func (w *worker) retryScheduler() {
	ctx := context.Background()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		now := float64(time.Now().Unix())

		members, err := w.rdb.ZRangeByScore(ctx, services.QueueRetry, &redis.ZRangeBy{
			Min: "0",
			Max: fmt.Sprintf("%f", now),
		}).Result()
		if err != nil {
			w.log.Errorf("retry-scheduler ZRangeByScore error: %v", err)
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
			w.log.Errorf("retry-scheduler pipeline error: %v", err)
		} else {
			w.log.Infof("retry-scheduler: %d job(s) re-enqueués", len(members))
		}
	}
}
