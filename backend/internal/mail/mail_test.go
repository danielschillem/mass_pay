package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"masspay-bf/internal/config"
)

func TestLogSenderSendsWithoutNetwork(t *testing.T) {
	sender := NewSender(&config.Config{MailProvider: "log"})

	result, err := sender.Send(context.Background(), Message{
		To:      []string{"admin@example.test"},
		Subject: "Test",
		Text:    "OK",
	})
	if err != nil {
		t.Fatalf("send log mail: %v", err)
	}
	if result.Provider != "log" || result.Status != "logged" {
		t.Fatalf("result = %+v, want log/logged", result)
	}
}

func TestResendSenderUsesHTTPSAPIShape(t *testing.T) {
	var authHeader string
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"email_123"}`))
	}))
	defer server.Close()

	sender := NewSender(&config.Config{
		MailProvider:       "resend",
		MailFromEmail:      "no_reply@example.test",
		MailFromName:       "MynaPay",
		MailAPIKey:         "test-key",
		MailAPIURL:         server.URL,
		MailTimeoutSeconds: 2,
	})
	result, err := sender.Send(context.Background(), Message{
		To:      []string{"admin@example.test"},
		Subject: "Test",
		Text:    "OK",
	})
	if err != nil {
		t.Fatalf("send resend mail: %v", err)
	}
	if authHeader != "Bearer test-key" {
		t.Fatalf("Authorization = %q", authHeader)
	}
	if payload["from"] != `"MynaPay" <no_reply@example.test>` {
		t.Fatalf("from = %v", payload["from"])
	}
	if result.MessageID != "email_123" {
		t.Fatalf("message id = %q", result.MessageID)
	}
}

func TestBrevoSenderUsesHTTPSAPIShape(t *testing.T) {
	var apiKey string
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey = r.Header.Get("api-key")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messageId":"msg-123"}`))
	}))
	defer server.Close()

	sender := NewSender(&config.Config{
		MailProvider:       "brevo",
		MailFromEmail:      "no_reply@example.test",
		MailFromName:       "MynaPay",
		MailAPIKey:         "test-key",
		MailAPIURL:         server.URL,
		MailTimeoutSeconds: 2,
	})
	result, err := sender.Send(context.Background(), Message{
		To:      []string{"admin@example.test"},
		Subject: "Test",
		HTML:    "<p>OK</p>",
	})
	if err != nil {
		t.Fatalf("send brevo mail: %v", err)
	}
	if apiKey != "test-key" {
		t.Fatalf("api-key = %q", apiKey)
	}
	senderPayload := payload["sender"].(map[string]any)
	if senderPayload["email"] != "no_reply@example.test" {
		t.Fatalf("sender email = %v", senderPayload["email"])
	}
	if result.MessageID != "msg-123" {
		t.Fatalf("message id = %q", result.MessageID)
	}
}
