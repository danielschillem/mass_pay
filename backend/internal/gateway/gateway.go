package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

// ── Interface ─────────────────────────────────────────────────────

type SendRequest struct {
	Phone     string
	Amount    int64  // FCFA
	Reference string // identifiant interne batch_item_id
	Label     string // libellé affiché au destinataire
}

type SendResponse struct {
	OperatorRef string // ID transaction côté opérateur
	Status      string // "success" | "pending" | "failed"
	Message     string
}

type Gateway interface {
	Send(ctx context.Context, req SendRequest) (*SendResponse, error)
	// CheckStatus permet de vérifier une transaction asynchrone (Orange notamment)
	CheckStatus(ctx context.Context, operatorRef string) (*SendResponse, error)
	Operator() models.Operator
}

// ── Factory ───────────────────────────────────────────────────────

func New(op models.Operator, cfg *config.Config) Gateway {
	switch op {
	case models.OperatorOrange:
		return &orangeGateway{cfg: cfg, client: &http.Client{Timeout: 30 * time.Second}}
	case models.OperatorMoov:
		return &moovGateway{cfg: cfg, client: &http.Client{Timeout: 30 * time.Second}}
	default:
		return &unknownGateway{}
	}
}

// ── Orange Money BF ───────────────────────────────────────────────
// Référence API : https://developer.orange.com/apis/om-webpay-bf
// En production, adapter les endpoints et le format d'auth selon la
// documentation officielle Orange BF B2B.

type orangeGateway struct {
	cfg    *config.Config
	client *http.Client
}

func (g *orangeGateway) Operator() models.Operator { return models.OperatorOrange }

func (g *orangeGateway) Send(ctx context.Context, req SendRequest) (*SendResponse, error) {
	payload := map[string]interface{}{
		"merchant_key":  g.cfg.OrangeAccountID,
		"currency":      "OUV",
		"order_id":      req.Reference,
		"amount":        req.Amount,
		"return_url":    "",
		"cancel_url":    "",
		"notif_url":     "",
		"lang":          "fr",
		"reference":     req.Label,
		"msisdn":        req.Phone,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		g.cfg.OrangeBaseURL+"/cashin", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("orange: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+g.cfg.OrangeAPIKey)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("orange: http: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("orange: decode: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		msg, _ := result["message"].(string)
		return nil, fmt.Errorf("orange: API error %d: %s", resp.StatusCode, msg)
	}

	ref, _ := result["pay_token"].(string)
	return &SendResponse{
		OperatorRef: ref,
		Status:      "success",
		Message:     "virement Orange Money initié",
	}, nil
}

func (g *orangeGateway) CheckStatus(ctx context.Context, operatorRef string) (*SendResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		g.cfg.OrangeBaseURL+"/payment/"+operatorRef, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+g.cfg.OrangeAPIKey)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result) //nolint

	status := "pending"
	if s, ok := result["status"].(string); ok {
		status = s
	}
	return &SendResponse{OperatorRef: operatorRef, Status: status}, nil
}

// ── Moov Money BF ─────────────────────────────────────────────────
// Référence API : Moov Africa Open API BF
// Adapter selon documentation Moov BF disponible via le portail
// développeur ou via accord commercial direct.

type moovGateway struct {
	cfg    *config.Config
	client *http.Client
}

func (g *moovGateway) Operator() models.Operator { return models.OperatorMoov }

func (g *moovGateway) Send(ctx context.Context, req SendRequest) (*SendResponse, error) {
	payload := map[string]interface{}{
		"amount":            req.Amount,
		"currency":          "XOF",
		"externalReference": req.Reference,
		"receiverMsisdn":    req.Phone,
		"description":       req.Label,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		g.cfg.MoovBaseURL+"/disbursements", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("moov: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-API-Key", g.cfg.MoovAPIKey)
	httpReq.Header.Set("X-Account-ID", g.cfg.MoovAccountID)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("moov: http: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("moov: decode: %w", err)
	}

	if resp.StatusCode >= 400 {
		msg, _ := result["message"].(string)
		return nil, fmt.Errorf("moov: API error %d: %s", resp.StatusCode, msg)
	}

	ref, _ := result["transactionId"].(string)
	return &SendResponse{
		OperatorRef: ref,
		Status:      "success",
		Message:     "virement Moov Money initié",
	}, nil
}

func (g *moovGateway) CheckStatus(ctx context.Context, operatorRef string) (*SendResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		g.cfg.MoovBaseURL+"/disbursements/"+operatorRef, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("X-API-Key", g.cfg.MoovAPIKey)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result) //nolint

	status, _ := result["status"].(string)
	if status == "" {
		status = "pending"
	}
	return &SendResponse{OperatorRef: operatorRef, Status: status}, nil
}

// ── Fallback opérateur inconnu ────────────────────────────────────

type unknownGateway struct{}

func (g *unknownGateway) Operator() models.Operator { return models.OperatorUnknown }
func (g *unknownGateway) Send(_ context.Context, req SendRequest) (*SendResponse, error) {
	return nil, fmt.Errorf("opérateur inconnu pour le numéro %s", req.Phone)
}
func (g *unknownGateway) CheckStatus(_ context.Context, _ string) (*SendResponse, error) {
	return nil, fmt.Errorf("opérateur inconnu")
}
