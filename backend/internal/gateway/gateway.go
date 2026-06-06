package gateway

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"sync"
	"time"

	"masspay-bf/internal/config"
	"masspay-bf/internal/models"
)

// ── Interface ─────────────────────────────────────────────────────

type SendRequest struct {
	Phone     string
	Amount    int64  // FCFA
	Reference string // identifiant interne batch_item_id
	Label     string
}

type SendResponse struct {
	OperatorRef string // ID transaction côté opérateur
	Status      string // "success" | "pending" | "failed"
	Message     string
}

type Gateway interface {
	Send(ctx context.Context, req SendRequest) (*SendResponse, error)
	CheckStatus(ctx context.Context, operatorRef string) (*SendResponse, error)
	Operator() models.Operator
}

// ── Factory ───────────────────────────────────────────────────────

func New(op models.Operator, cfg *config.Config) Gateway {
	switch op {
	case models.OperatorOrange:
		return &orangeGateway{cfg: cfg}
	case models.OperatorMoov:
		return &moovGateway{cfg: cfg, client: &http.Client{Timeout: 40 * time.Second}}
	default:
		return &unknownGateway{}
	}
}

// ── Orange Money BF — Online Payment API (XML-RPC) ────────────────
// Réf. : "Orange Money online payment technical specification document"
//
// Test : https://testom.orange.bf/   (USSD OTP : *865*4*6*montant#)
// Prod : https://apiom.orange.bf/    (USSD OTP : *144*4*6*montant#)
//
// Sécurité : mTLS — le client présente son certificat Orange BF
//   Cert  : ORANGE_MONEY_CERT_PUBLIC  (star_orange_bf.pem — chaîne)
//   Clé   : ORANGE_MONEY_CERT_PRIVATE (OrangeBFV22026.key — RSA privée)
//
// Virements masse (B2B pré-autorisé) : champ <otp> laissé vide.
// Orange BF autorise les transferts sans OTP pour les marchands agréés
// effectuant des paiements de masse (salaires, primes, commissions).

type orangeGateway struct {
	cfg *config.Config

	once    sync.Once
	client  *http.Client
	initErr error
}

func (g *orangeGateway) Operator() models.Operator { return models.OperatorOrange }

// init construit le client HTTP avec le certificat mTLS Orange.
// Appelé une seule fois au premier Send (lazy init thread-safe).
func (g *orangeGateway) init() error {
	g.once.Do(func() {
		tlsCfg := &tls.Config{}

		certPath := g.cfg.OrangeCertPublic
		keyPath := g.cfg.OrangeCertPrivate

		if certPath != "" && keyPath != "" {
			kp, err := tls.LoadX509KeyPair(certPath, keyPath)
			if err != nil {
				g.initErr = fmt.Errorf("orange: chargement certificat mTLS: %w", err)
				return
			}
			tlsCfg.Certificates = []tls.Certificate{kp}
		}

		g.client = &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: tlsCfg,
			},
		}
	})
	return g.initErr
}

func (g *orangeGateway) baseURL() string {
	if g.cfg.OrangeEnv == "production" {
		return g.cfg.OrangeProdURL
	}
	return g.cfg.OrangeTestURL
}

// xmlPayment est la requête XML-RPC envoyée à Orange Money.
type xmlPayment struct {
	XMLName         xml.Name `xml:"COMMAND"`
	Type            string   `xml:"TYPE"`
	CustomerMSISDN  string   `xml:"customer_msisdn"`
	MerchantMSISDN  string   `xml:"merchant_msisdn"`
	APIUsername     string   `xml:"api_username"`
	APIPassword     string   `xml:"api_password"`
	Amount          int64    `xml:"amount"`
	Provider        string   `xml:"PROVIDER"`
	Provider2       string   `xml:"PROVIDER2"`
	PayID           string   `xml:"PAYID"`
	PayID2          string   `xml:"PAYID2"`
	OTP             string   `xml:"otp"`
	ReferenceNumber string   `xml:"reference_number"`
	ExtTxnID        string   `xml:"ext_txn_id"`
}

// xmlResult est la réponse XML Orange Money enveloppée dans <response>.
type xmlResult struct {
	Status  string `xml:"status"`
	Message string `xml:"message"`
	TransID string `xml:"transID"`
}

func (g *orangeGateway) Send(ctx context.Context, req SendRequest) (*SendResponse, error) {
	if err := g.init(); err != nil {
		return nil, err
	}

	payload := xmlPayment{
		Type:            "OMPREQ",
		CustomerMSISDN:  req.Phone,
		MerchantMSISDN:  g.cfg.OrangeMerchantMSISDN,
		APIUsername:     g.cfg.OrangeAPIUsername,
		APIPassword:     g.cfg.OrangeAPIPassword,
		Amount:          req.Amount,
		Provider:        g.cfg.OrangeProvider,
		Provider2:       g.cfg.OrangeProvider,
		PayID:           g.cfg.OrangePayID,
		PayID2:          g.cfg.OrangePayID,
		OTP:             "", // vide pour virements masse B2B pré-autorisés
		ReferenceNumber: req.Reference,
		ExtTxnID:        req.Reference,
	}

	rawXML, err := xml.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("orange: marshal XML: %w", err)
	}
	body := append([]byte(xml.Header), rawXML...)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		g.baseURL(), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("orange: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/xml")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("orange: http: %w", err)
	}
	defer resp.Body.Close()

	// La réponse est un fragment XML sans balise racine — on l'enveloppe
	// pour que encoding/xml puisse la parser correctement.
	var buf bytes.Buffer
	buf.WriteString("<response>")
	buf.ReadFrom(resp.Body)
	buf.WriteString("</response>")

	var wrapped struct {
		XMLName xml.Name `xml:"response"`
		xmlResult
	}
	if err := xml.Unmarshal(buf.Bytes(), &wrapped); err != nil {
		return nil, fmt.Errorf("orange: parse response: %w — raw: %s", err, buf.String())
	}

	if wrapped.Status != "200" {
		return nil, fmt.Errorf("orange: erreur %s — %s", wrapped.Status, wrapped.Message)
	}

	return &SendResponse{
		OperatorRef: wrapped.TransID,
		Status:      "success",
		Message:     wrapped.Message,
	}, nil
}

// CheckStatus — l'API Online Payment Orange BF est synchrone.
// Le statut final est retourné directement dans la réponse XML du Send.
func (g *orangeGateway) CheckStatus(_ context.Context, operatorRef string) (*SendResponse, error) {
	return &SendResponse{OperatorRef: operatorRef, Status: "pending"}, nil
}

// ── Moov Money BF — Online Merchant USSD Push (Huawei) ────────────
// Réf. : "Online Merchant with USSD PUSH" — 2025-12-05
//
// UAT  : https://uat.moov-money.bf:38443
// Auth : HTTP Basic Auth (username/password fournis par Moov Money)
//
// Flux mass pay (virements de masse) :
//   1. Send  → POST /apiaccess/Deduction (command-id: mror-transaction-ussd)
//              L'abonné reçoit un USSD push pour confirmer avec son PIN.
//              Réponse initiale status="0" → opération asynchrone (pending).
//   2. CheckStatus → POST /apiaccess/SearchTransactionByExtID
//              (command-id: process-check-transaction)
//              Retourne le statut final : "0"=SUCCESS, "12"=FAILED, "15"=UNKNOWN.
//
// Le champ OperatorRef est le request-id original (= batch_item_id UUID)
// utilisé lors du Send, réutilisé pour SearchTransactionByExtID.

type moovGateway struct {
	cfg    *config.Config
	client *http.Client
}

func (g *moovGateway) Operator() models.Operator { return models.OperatorMoov }

func (g *moovGateway) baseURL() string {
	if g.cfg.MoovEnv == "production" && g.cfg.MoovProdURL != "" {
		return g.cfg.MoovProdURL
	}
	return g.cfg.MoovTestURL
}

// moovRequest construit et exécute une requête POST vers l'API Moov Money BF.
// Le header command-id sélectionne l'opération côté Huawei.
func (g *moovGateway) moovRequest(ctx context.Context, path, commandID string, body interface{}) (map[string]interface{}, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("moov: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		g.baseURL()+path, bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("moov: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("command-id", commandID)
	httpReq.SetBasicAuth(g.cfg.MoovUsername, g.cfg.MoovPassword)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("moov: http: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("moov: decode response: %w", err)
	}

	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("moov: authentification refusée (Basic Auth invalide)")
	}
	if resp.StatusCode >= 400 {
		msg, _ := result["message"].(string)
		return nil, fmt.Errorf("moov: erreur HTTP %d — %s", resp.StatusCode, msg)
	}

	return result, nil
}

// moovStatus traduit le code status Moov ("0"/"12"/"15") en statut interne.
func moovStatus(code string) string {
	switch code {
	case "0":
		return "success"
	case "12":
		return "failed"
	default: // "15" = UNKNOWN, ou vide
		return "pending"
	}
}

// Send envoie un virement via USSD Push Moov Money BF.
// L'API est asynchrone : le retour initial status="0" signifie que le push USSD
// a été envoyé à l'abonné — la confirmation PIN est attendue par l'abonné.
// On retourne "pending" pour déclencher le polling via CheckStatus.
func (g *moovGateway) Send(ctx context.Context, req SendRequest) (*SendResponse, error) {
	payload := map[string]interface{}{
		"request-id":  req.Reference,
		"destination": req.Phone,
		"amount":      req.Amount,
		"remarks":     "MynaPay",
		"message": fmt.Sprintf("PAIEMENT DE %d FCFA PAR MYNAPAY. CONFIRMEZ AVEC VOTRE PIN.",
			req.Amount),
		"extended-data": map[string]interface{}{},
	}

	result, err := g.moovRequest(ctx, "/apiaccess/Deduction", "mror-transaction-ussd", payload)
	if err != nil {
		return nil, err
	}

	status, _ := result["status"].(string)
	transID, _ := result["trans-id"].(string)
	message, _ := result["message"].(string)

	if status == "12" {
		return nil, fmt.Errorf("moov: paiement échoué — %s", message)
	}

	// status="0" → USSD push envoyé (async), status="15" → timeout (pending)
	// Dans les deux cas on retourne "pending" et le worker repassera via CheckStatus.
	operatorRef := req.Reference // utilisé pour SearchTransactionByExtID
	if transID != "" {
		operatorRef = transID
	}

	return &SendResponse{
		OperatorRef: operatorRef,
		Status:      "pending",
		Message:     message,
	}, nil
}

// CheckStatus interroge le statut final d'une transaction Moov Money BF.
// operatorRef = trans-id retourné par Send (ou request-id si trans-id absent).
// Note API : SearchTransactionByExtID supporte uniquement les transactions du jour.
func (g *moovGateway) CheckStatus(ctx context.Context, operatorRef string) (*SendResponse, error) {
	payload := map[string]string{
		"request-id": operatorRef,
	}

	result, err := g.moovRequest(ctx, "/apiaccess/SearchTransactionByExtID",
		"process-check-transaction", payload)
	if err != nil {
		return nil, err
	}

	status, _ := result["status"].(string)
	message, _ := result["message"].(string)
	transID, _ := result["trans-id"].(string)
	if transID == "" {
		transID = operatorRef
	}

	return &SendResponse{
		OperatorRef: transID,
		Status:      moovStatus(status),
		Message:     message,
	}, nil
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
