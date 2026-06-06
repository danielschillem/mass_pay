package mail

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	netmail "net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/sirupsen/logrus"

	"masspay-bf/internal/config"
)

type Message struct {
	To      []string
	Subject string
	Text    string
	HTML    string
}

type Result struct {
	Provider  string `json:"provider"`
	MessageID string `json:"message_id,omitempty"`
	Status    string `json:"status"`
}

type Sender interface {
	Provider() string
	Configured() bool
	Send(ctx context.Context, msg Message) (*Result, error)
}

func NewSender(cfg *config.Config) Sender {
	provider := strings.ToLower(strings.TrimSpace(cfg.MailProvider))
	if provider == "" {
		provider = "smtp"
	}

	switch provider {
	case "log":
		return &logSender{cfg: cfg}
	case "brevo", "sendinblue":
		return &apiSender{cfg: cfg, provider: "brevo", defaultURL: "https://api.brevo.com/v3/smtp/email"}
	case "resend":
		return &apiSender{cfg: cfg, provider: "resend", defaultURL: "https://api.resend.com/emails"}
	case "smtp":
		return &smtpSender{cfg: cfg}
	default:
		return &disabledSender{provider: provider}
	}
}

func validateMessage(msg Message) error {
	if len(msg.To) == 0 {
		return errors.New("destinataire requis")
	}
	for _, to := range msg.To {
		if _, err := netmail.ParseAddress(strings.TrimSpace(to)); err != nil {
			return fmt.Errorf("destinataire invalide %q: %w", to, err)
		}
	}
	if strings.TrimSpace(msg.Subject) == "" {
		return errors.New("sujet requis")
	}
	if strings.TrimSpace(msg.Text) == "" && strings.TrimSpace(msg.HTML) == "" {
		return errors.New("contenu mail requis")
	}
	return nil
}

func timeout(cfg *config.Config) time.Duration {
	seconds := cfg.MailTimeoutSeconds
	if seconds <= 0 {
		seconds = 10
	}
	return time.Duration(seconds) * time.Second
}

func fromAddress(cfg *config.Config) string {
	email := strings.TrimSpace(cfg.MailFromEmail)
	if email == "" {
		return ""
	}
	return (&netmail.Address{Name: strings.TrimSpace(cfg.MailFromName), Address: email}).String()
}

type disabledSender struct {
	provider string
}

func (s *disabledSender) Provider() string { return s.provider }
func (s *disabledSender) Configured() bool { return false }
func (s *disabledSender) Send(context.Context, Message) (*Result, error) {
	return nil, fmt.Errorf("fournisseur mail non supporté: %s", s.provider)
}

type logSender struct {
	cfg *config.Config
}

func (s *logSender) Provider() string { return "log" }
func (s *logSender) Configured() bool { return true }

func (s *logSender) Send(ctx context.Context, msg Message) (*Result, error) {
	if err := validateMessage(msg); err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	id := "log-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	logrus.WithFields(logrus.Fields{
		"provider":   "log",
		"message_id": id,
		"to_count":   len(msg.To),
		"subject":    msg.Subject,
	}).Info("mail transactionnel simulé")
	return &Result{Provider: "log", MessageID: id, Status: "logged"}, nil
}

type apiSender struct {
	cfg        *config.Config
	provider   string
	defaultURL string
}

func (s *apiSender) Provider() string { return s.provider }
func (s *apiSender) Configured() bool {
	return strings.TrimSpace(s.cfg.MailFromEmail) != "" && strings.TrimSpace(s.cfg.MailAPIKey) != ""
}

func (s *apiSender) Send(ctx context.Context, msg Message) (*Result, error) {
	if err := validateMessage(msg); err != nil {
		return nil, err
	}
	if !s.Configured() {
		return nil, errors.New("MAIL_FROM_EMAIL et MAIL_API_KEY sont requis")
	}

	endpoint := strings.TrimSpace(s.cfg.MailAPIURL)
	if endpoint == "" {
		endpoint = s.defaultURL
	}

	payload, err := s.payload(msg)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if s.provider == "brevo" {
		req.Header.Set("api-key", s.cfg.MailAPIKey)
	} else {
		req.Header.Set("Authorization", "Bearer "+s.cfg.MailAPIKey)
	}

	client := &http.Client{Timeout: timeout(s.cfg)}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s API status %d: %s", s.provider, resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	id := responseID(respBody)
	if id == "" {
		id = s.provider + "-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return &Result{Provider: s.provider, MessageID: id, Status: "sent"}, nil
}

func (s *apiSender) payload(msg Message) (any, error) {
	switch s.provider {
	case "brevo":
		to := make([]map[string]string, 0, len(msg.To))
		for _, email := range msg.To {
			to = append(to, map[string]string{"email": strings.TrimSpace(email)})
		}
		body := map[string]any{
			"sender": map[string]string{
				"email": strings.TrimSpace(s.cfg.MailFromEmail),
				"name":  strings.TrimSpace(s.cfg.MailFromName),
			},
			"to":      to,
			"subject": msg.Subject,
		}
		if strings.TrimSpace(msg.HTML) != "" {
			body["htmlContent"] = msg.HTML
		}
		if strings.TrimSpace(msg.Text) != "" {
			body["textContent"] = msg.Text
		}
		return body, nil
	case "resend":
		body := map[string]any{
			"from":    fromAddress(s.cfg),
			"to":      msg.To,
			"subject": msg.Subject,
		}
		if strings.TrimSpace(msg.HTML) != "" {
			body["html"] = msg.HTML
		}
		if strings.TrimSpace(msg.Text) != "" {
			body["text"] = msg.Text
		}
		return body, nil
	default:
		return nil, fmt.Errorf("fournisseur API non supporté: %s", s.provider)
	}
}

func responseID(body []byte) string {
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ""
	}
	for _, key := range []string{"messageId", "message_id", "id"} {
		if value, ok := parsed[key].(string); ok {
			return value
		}
	}
	return ""
}

type smtpSender struct {
	cfg *config.Config
}

func (s *smtpSender) Provider() string { return "smtp" }
func (s *smtpSender) Configured() bool {
	return strings.TrimSpace(s.cfg.MailFromEmail) != "" &&
		strings.TrimSpace(s.cfg.SMTPHost) != "" &&
		strings.TrimSpace(s.cfg.SMTPUsername) != "" &&
		strings.TrimSpace(s.cfg.SMTPPassword) != ""
}

func (s *smtpSender) Send(ctx context.Context, msg Message) (*Result, error) {
	if err := validateMessage(msg); err != nil {
		return nil, err
	}
	if !s.Configured() {
		return nil, errors.New("configuration SMTP incomplète")
	}

	host := strings.TrimSpace(s.cfg.SMTPHost)
	addr := net.JoinHostPort(host, strconv.Itoa(s.cfg.SMTPPort))
	dialer := net.Dialer{Timeout: timeout(s.cfg)}

	var conn net.Conn
	var err error
	if s.cfg.SMTPUseTLS && s.cfg.SMTPPort == 465 {
		conn, err = tls.DialWithDialer(&dialer, "tcp", addr, &tls.Config{
			MinVersion: tls.VersionTLS12,
			ServerName: host,
		})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	if s.cfg.SMTPUseTLS && s.cfg.SMTPPort != 465 {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{MinVersion: tls.VersionTLS12, ServerName: host}); err != nil {
				return nil, err
			}
		}
	}

	auth := smtp.PlainAuth("", s.cfg.SMTPUsername, s.cfg.SMTPPassword, host)
	if err := client.Auth(auth); err != nil {
		return nil, err
	}
	if err := client.Mail(s.cfg.MailFromEmail); err != nil {
		return nil, err
	}
	for _, to := range msg.To {
		if err := client.Rcpt(strings.TrimSpace(to)); err != nil {
			return nil, err
		}
	}
	writer, err := client.Data()
	if err != nil {
		return nil, err
	}
	if _, err := writer.Write(buildMIMEMessage(s.cfg, msg)); err != nil {
		_ = writer.Close()
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	_ = client.Quit()

	return &Result{Provider: "smtp", MessageID: "smtp-" + strconv.FormatInt(time.Now().UnixNano(), 36), Status: "sent"}, nil
}

func buildMIMEMessage(cfg *config.Config, msg Message) []byte {
	var b strings.Builder
	writeHeader := func(key, value string) {
		if strings.TrimSpace(value) != "" {
			b.WriteString(key)
			b.WriteString(": ")
			b.WriteString(value)
			b.WriteString("\r\n")
		}
	}

	writeHeader("From", fromAddress(cfg))
	writeHeader("To", strings.Join(msg.To, ", "))
	writeHeader("Subject", mime.QEncoding.Encode("utf-8", msg.Subject))
	writeHeader("MIME-Version", "1.0")

	text := strings.TrimSpace(msg.Text)
	html := strings.TrimSpace(msg.HTML)
	if text != "" && html != "" {
		boundary := "mynapay-" + strconv.FormatInt(time.Now().UnixNano(), 36)
		writeHeader("Content-Type", `multipart/alternative; boundary="`+boundary+`"`)
		b.WriteString("\r\n")
		b.WriteString("--" + boundary + "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
		b.WriteString(text)
		b.WriteString("\r\n--" + boundary + "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
		b.WriteString(html)
		b.WriteString("\r\n--" + boundary + "--\r\n")
		return []byte(b.String())
	}

	if html != "" {
		writeHeader("Content-Type", "text/html; charset=UTF-8")
	} else {
		writeHeader("Content-Type", "text/plain; charset=UTF-8")
	}
	writeHeader("Content-Transfer-Encoding", "8bit")
	b.WriteString("\r\n")
	if html != "" {
		b.WriteString(html)
	} else {
		b.WriteString(text)
	}
	return []byte(b.String())
}
