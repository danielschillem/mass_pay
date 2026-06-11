package gateway

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
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

// ── Orange Money BF — CASHIN API ─────────────────────────────────
// Réf. : "Contrat d'interface API OM : CASHIN" — Octobre 2024.
//
// Flux métier MynaPay :
//   1. GET API TOKEN : POST form-urlencoded USERNAME/PASSWORD/grant_type.
//   2. CASHIN       : POST JSON avec api-key + Bearer TOKEN.
//   3. Orange débite le compte Agent MynaPay (msisdn alias OBF) puis crédite
//      le compte Subscriber bénéficiaire (msisdn2).
//
// Le PIN agent n'est jamais envoyé en clair : il est chiffré avec la clé
// publique RSA fournie par OMBF avant chaque transaction.

type orangeGateway struct {
	cfg *config.Config

	once         sync.Once
	client       *http.Client
	initErr      error
	tokenMu      sync.Mutex
	token        string
	tokenExpires time.Time
}

func (g *orangeGateway) Operator() models.Operator { return models.OperatorOrange }

// init construit le client HTTP. Le mTLS reste optionnel si OMBF l'impose.
// Appelé une seule fois au premier Send (lazy init thread-safe).
func (g *orangeGateway) init() error {
	g.once.Do(func() {
		if err := g.validateConfig(); err != nil {
			g.initErr = err
			return
		}

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

func (g *orangeGateway) validateConfig() error {
	var missing []string

	required := []struct {
		name  string
		value string
	}{
		{"ORANGE_MONEY_CASHIN_TOKEN_URL", g.cfg.OrangeCashinTokenURL},
		{"ORANGE_MONEY_CASHIN_URL", g.cfg.OrangeCashinURL},
		{"ORANGE_MONEY_CASHIN_API_KEY", g.cfg.OrangeCashinAPIKey},
		{"ORANGE_MONEY_CASHIN_USERNAME", g.cfg.OrangeCashinUsername},
		{"ORANGE_MONEY_CASHIN_PASSWORD", g.cfg.OrangeCashinPassword},
		{"ORANGE_MONEY_AGENT_ALIAS", g.cfg.OrangeCashinAgentAlias},
		{"ORANGE_MONEY_AGENT_PIN", g.cfg.OrangeCashinAgentPIN},
		{"ORANGE_MONEY_PIN_PUBLIC_KEY", g.cfg.OrangePINPublicKey},
	}

	for _, field := range required {
		if strings.TrimSpace(field.value) == "" {
			missing = append(missing, field.name)
		}
	}
	if strings.TrimSpace(g.cfg.OrangePINPublicKey) != "" {
		if _, err := os.Stat(g.cfg.OrangePINPublicKey); err != nil {
			missing = append(missing, "ORANGE_MONEY_PIN_PUBLIC_KEY introuvable")
		}
	}

	certPath := strings.TrimSpace(g.cfg.OrangeCertPublic)
	keyPath := strings.TrimSpace(g.cfg.OrangeCertPrivate)
	if certPath == "" && keyPath != "" {
		missing = append(missing, "ORANGE_MONEY_CERT_PUBLIC")
	}
	if certPath != "" && keyPath == "" {
		missing = append(missing, "ORANGE_MONEY_CERT_PRIVATE")
	}

	if len(missing) > 0 {
		return fmt.Errorf("orange: configuration incomplete (%s)", strings.Join(missing, ", "))
	}

	return nil
}

// ValidateOrangeConfig vérifie le pré-vol CASHIN sans envoyer de transaction.
func ValidateOrangeConfig(cfg *config.Config) error {
	return (&orangeGateway{cfg: cfg}).validateConfig()
}

func (g *orangeGateway) Send(ctx context.Context, req SendRequest) (*SendResponse, error) {
	if err := g.init(); err != nil {
		return nil, err
	}

	if req.Amount <= 0 {
		return nil, fmt.Errorf("orange cashin: montant invalide %d", req.Amount)
	}
	if strings.TrimSpace(req.Phone) == "" {
		return nil, fmt.Errorf("orange cashin: msisdn bénéficiaire requis")
	}

	token, err := g.accessToken(ctx)
	if err != nil {
		return nil, err
	}

	encryptedPIN, err := encryptPIN(g.cfg.OrangeCashinAgentPIN, g.cfg.OrangePINPublicKey)
	if err != nil {
		return nil, fmt.Errorf("orange cashin: chiffrement PIN: %w", err)
	}

	payload := orangeCashinRequest{
		Amount:  strconv.FormatInt(req.Amount, 10),
		MSISDN:  g.cfg.OrangeCashinAgentAlias,
		MSISDN2: req.Phone,
		PIN:     encryptedPIN,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("orange cashin: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, g.cfg.OrangeCashinURL, bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("orange cashin: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("api-key", g.cfg.OrangeCashinAPIKey)
	httpReq.Header.Set("Authorization", "Bearer "+token)

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("orange cashin: http: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("orange cashin: read response: %w", err)
	}

	result, err := parseCashinResponse(body)
	if err != nil {
		return nil, fmt.Errorf("orange cashin: parse response: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("orange cashin: authentification refusée — %s", result.Message)
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("orange cashin: accès refusé — %s", result.Message)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("orange cashin: erreur HTTP %d — %s", resp.StatusCode, result.Message)
	}

	status := orangeCashinStatus(result.TransactionStatus, result.Success)
	if !result.Success && status != "pending" {
		return nil, fmt.Errorf("orange cashin: %s", result.Message)
	}

	operatorRef := result.TransactionID
	if operatorRef == "" {
		operatorRef = req.Reference
	}
	message := result.Message
	if result.TransactionMessage != "" {
		message = result.TransactionMessage
	}

	return &SendResponse{
		OperatorRef: operatorRef,
		Status:      status,
		Message:     message,
	}, nil
}

// CheckStatus — la documentation CASHIN fournie ne décrit pas d'API de statut.
// Le résultat de la transaction est donc lu dans la réponse du Send.
func (g *orangeGateway) CheckStatus(_ context.Context, operatorRef string) (*SendResponse, error) {
	return &SendResponse{OperatorRef: operatorRef, Status: "pending"}, nil
}

type orangeCashinRequest struct {
	Amount  string `json:"amount"`
	MSISDN  string `json:"msisdn"`
	MSISDN2 string `json:"msisdn2"`
	PIN     string `json:"pin"`
}

type orangeTokenResponse struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type cashinResult struct {
	Success            bool
	Message            string
	TransactionID      string
	TransactionStatus  string
	TransactionMessage string
}

func (g *orangeGateway) accessToken(ctx context.Context) (string, error) {
	g.tokenMu.Lock()
	defer g.tokenMu.Unlock()

	if g.token != "" && time.Now().Before(g.tokenExpires) {
		return g.token, nil
	}

	form := url.Values{}
	form.Set("USERNAME", g.cfg.OrangeCashinUsername)
	form.Set("PASSWORD", g.cfg.OrangeCashinPassword)
	form.Set("grant_type", "client_credentials")

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, g.cfg.OrangeCashinTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("orange token: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("orange token: http: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("orange token: read response: %w", err)
	}

	var result orangeTokenResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("orange token: parse response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("orange token: authentification refusée — %s", result.ErrorDescription)
	}
	if resp.StatusCode >= 400 {
		msg := result.ErrorDescription
		if msg == "" {
			msg = result.Error
		}
		return "", fmt.Errorf("orange token: erreur HTTP %d — %s", resp.StatusCode, msg)
	}
	if strings.TrimSpace(result.AccessToken) == "" {
		return "", fmt.Errorf("orange token: access_token absent")
	}

	expiresIn := result.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 300
	}
	g.token = result.AccessToken
	g.tokenExpires = time.Now().Add(time.Duration(expiresIn-30) * time.Second)
	if time.Now().After(g.tokenExpires) {
		g.tokenExpires = time.Now().Add(30 * time.Second)
	}
	return g.token, nil
}

func encryptPIN(pin, publicKeyPath string) (string, error) {
	raw, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return "", err
	}

	pub, err := parseRSAPublicKey(raw)
	if err != nil {
		return "", err
	}

	encrypted, err := rsa.EncryptPKCS1v15(rand.Reader, pub, []byte(pin))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func parseRSAPublicKey(raw []byte) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, fmt.Errorf("clé publique RSA PEM invalide")
	}

	switch block.Type {
	case "PUBLIC KEY":
		key, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		pub, ok := key.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("la clé publique n'est pas RSA")
		}
		return pub, nil
	case "RSA PUBLIC KEY":
		return x509.ParsePKCS1PublicKey(block.Bytes)
	case "CERTIFICATE":
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, err
		}
		pub, ok := cert.PublicKey.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("le certificat ne contient pas de clé publique RSA")
		}
		return pub, nil
	default:
		return nil, fmt.Errorf("type PEM non supporté: %s", block.Type)
	}
}

func parseCashinResponse(body []byte) (*cashinResult, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	result := &cashinResult{
		Success: boolField(raw, "success"),
		Message: stringField(raw, "message"),
	}
	if result.Message == "" {
		result.Message = stringField(raw, "error_description")
	}
	if result.Message == "" {
		result.Message = stringField(raw, "error")
	}

	data := rawJSONField(raw, "Data", "data")
	if len(data) > 0 && string(data) != "null" {
		extractCashinData(data, result)
	}

	return result, nil
}

func extractCashinData(raw json.RawMessage, result *cashinResult) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		fillCashinData(obj, result)
		return
	}

	var arr []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		fillCashinData(arr[0], result)
	}
}

func fillCashinData(data map[string]json.RawMessage, result *cashinResult) {
	result.TransactionID = stringField(data, "TXNID", "txnId", "txnid")
	result.TransactionStatus = stringField(data, "TXNSTATUS", "txnStatus", "txnstatus")
	result.TransactionMessage = stringField(data, "MESSAGE", "message")
	if result.Message == "" {
		result.Message = result.TransactionMessage
	}
}

func orangeCashinStatus(txnStatus string, success bool) string {
	status := strings.ToUpper(strings.TrimSpace(txnStatus))
	switch {
	case status == "":
		if success {
			return "success"
		}
		return "failed"
	case strings.Contains(status, "SUCCESS") ||
		strings.Contains(status, "SUCCES") ||
		status == "OK" ||
		status == "200":
		return "success"
	case strings.Contains(status, "PENDING") ||
		strings.Contains(status, "PROCESS") ||
		strings.Contains(status, "INIT") ||
		strings.Contains(status, "WAIT"):
		return "pending"
	case strings.Contains(status, "FAIL") ||
		strings.Contains(status, "ERROR") ||
		strings.Contains(status, "REJECT") ||
		strings.Contains(status, "CANCEL") ||
		status == "KO":
		return "failed"
	default:
		if success {
			return "success"
		}
		return "failed"
	}
}

func rawJSONField(values map[string]json.RawMessage, names ...string) json.RawMessage {
	for _, name := range names {
		if value, ok := values[name]; ok {
			return value
		}
		for key, value := range values {
			if strings.EqualFold(key, name) {
				return value
			}
		}
	}
	return nil
}

func stringField(values map[string]json.RawMessage, names ...string) string {
	raw := rawJSONField(values, names...)
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		return n.String()
	}
	return ""
}

func boolField(values map[string]json.RawMessage, names ...string) bool {
	raw := rawJSONField(values, names...)
	if len(raw) == 0 {
		return false
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return b
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.EqualFold(s, "true") || s == "1"
	}
	return false
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
