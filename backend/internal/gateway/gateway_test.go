package gateway

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"strings"
	"testing"

	"masspay-bf/internal/config"
)

func validOrangeCashinConfig(t *testing.T) *config.Config {
	t.Helper()

	return &config.Config{
		OrangeEnv:              "production",
		OrangeCashinTokenURL:   "https://orange.example/token",
		OrangeCashinURL:        "https://orange.example/cashin",
		OrangeCashinAPIKey:     "api-key",
		OrangeCashinUsername:   "user",
		OrangeCashinPassword:   "pass",
		OrangeCashinAgentAlias: "agent-alias",
		OrangeCashinAgentPIN:   "1234",
		OrangePINPublicKey:     writeTestPublicKey(t),
	}
}

func TestOrangeGatewayValidateConfigRequiresCashinFields(t *testing.T) {
	cfg := validOrangeCashinConfig(t)
	cfg.OrangeCashinURL = ""
	cfg.OrangeCashinAPIKey = ""

	err := (&orangeGateway{cfg: cfg}).validateConfig()
	if err == nil {
		t.Fatal("expected incomplete cashin config to fail")
	}
	if !strings.Contains(err.Error(), "ORANGE_MONEY_CASHIN_URL") ||
		!strings.Contains(err.Error(), "ORANGE_MONEY_CASHIN_API_KEY") {
		t.Fatalf("expected missing cashin fields in error, got %v", err)
	}
}

func TestParseCashinResponseExtractsTransactionData(t *testing.T) {
	raw := []byte(`{
		"success": true,
		"message": "OK",
		"Data": {
			"TYPE": "CASHIN",
			"TXNID": "OM123",
			"TXNSTATUS": "SUCCESS",
			"MESSAGE": "Transaction effectuee"
		}
	}`)

	result, err := parseCashinResponse(raw)
	if err != nil {
		t.Fatalf("parseCashinResponse: %v", err)
	}
	if !result.Success {
		t.Fatal("expected success")
	}
	if result.TransactionID != "OM123" {
		t.Fatalf("transaction id = %q, want OM123", result.TransactionID)
	}
	if result.TransactionStatus != "SUCCESS" {
		t.Fatalf("transaction status = %q, want SUCCESS", result.TransactionStatus)
	}
	if result.TransactionMessage != "Transaction effectuee" {
		t.Fatalf("transaction message = %q", result.TransactionMessage)
	}
}

func TestEncryptPINUsesRSAPublicKey(t *testing.T) {
	path := writeTestPublicKey(t)

	encrypted, err := encryptPIN("1234", path)
	if err != nil {
		t.Fatalf("encryptPIN: %v", err)
	}
	if encrypted == "" || encrypted == "1234" {
		t.Fatalf("unexpected encrypted PIN: %q", encrypted)
	}
}

func TestOrangeCashinStatus(t *testing.T) {
	cases := []struct {
		name    string
		status  string
		success bool
		want    string
	}{
		{name: "success flag without status", success: true, want: "success"},
		{name: "pending status", status: "PENDING", success: true, want: "pending"},
		{name: "failed status", status: "FAILED", success: true, want: "failed"},
		{name: "success status", status: "SUCCESS", success: true, want: "success"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := orangeCashinStatus(tc.status, tc.success)
			if got != tc.want {
				t.Fatalf("orangeCashinStatus(%q, %v) = %q, want %q", tc.status, tc.success, got, tc.want)
			}
		})
	}
}

func writeTestPublicKey(t *testing.T) string {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	raw := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	path := t.TempDir() + "/orange-pin-public.pem"
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatalf("write public key: %v", err)
	}
	return path
}
