package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"strconv"
	"time"
)

// DefaultKey est la clé AES-256 active (32 bytes). Initialisée au démarrage.
var DefaultKey []byte

// SetDefaultKey configure la clé de chiffrement globale.
func SetDefaultKey(key []byte) { DefaultKey = key }

// IsKeySet retourne vrai si une clé de chiffrement est configurée.
func IsKeySet() bool { return len(DefaultKey) == 32 }

// DecodeHexKey décode une clé hexadécimale 64 chars → 32 bytes AES-256.
func DecodeHexKey(hexKey string) ([]byte, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("FIELD_ENCRYPTION_KEY : hexadécimal invalide : %w", err)
	}
	if len(key) != 32 {
		return nil, errors.New("FIELD_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (32 bytes AES-256)")
	}
	return key, nil
}

// ── AES-256-GCM ───────────────────────────────────────────────────

// Encrypt chiffre une chaîne avec AES-256-GCM. Retourne du base64.
func Encrypt(plaintext string, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("clé de chiffrement invalide (doit être 32 bytes)")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt déchiffre un texte AES-256-GCM encodé en base64.
func Decrypt(encoded string, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("clé de chiffrement invalide (doit être 32 bytes)")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("base64 invalide : %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext trop court")
	}
	plaintext, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return "", fmt.Errorf("déchiffrement échoué : %w", err)
	}
	return string(plaintext), nil
}

// HMAC256 produit un hash HMAC-SHA-256 déterministe.
// Utilisé pour les index uniques sur des champs chiffrés (non réversible).
func HMAC256(value string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}

// PlainField retourne la valeur en clair si elle est chiffrée avec la clé active.
func PlainField(value string) string {
	if !IsKeySet() || value == "" {
		return value
	}
	dec, err := Decrypt(value, DefaultKey)
	if err != nil {
		return value
	}
	return dec
}

// EncryptField chiffre un champ si la clé globale est configurée, sinon retourne la valeur telle quelle.
func EncryptField(value string) string {
	if !IsKeySet() || value == "" {
		return value
	}
	value = PlainField(value)
	enc, err := Encrypt(value, DefaultKey)
	if err != nil {
		return value
	}
	return enc
}

// DecryptField déchiffre un champ si la clé globale est configurée.
// En cas d'échec (valeur déjà en clair, migration partielle), retourne la valeur originale.
func DecryptField(value string) string {
	return PlainField(value)
}

// HashField produit un HMAC-SHA-256 déterministe pour les index uniques.
func HashField(value string) string {
	if !IsKeySet() || value == "" {
		return value
	}
	value = PlainField(value)
	return HMAC256(value, DefaultKey)
}

// ── TOTP — RFC 6238 (implémentation stdlib pure) ──────────────────

// NewTOTPSecret génère un secret aléatoire 20 bytes encodé base32 (160 bits).
func NewTOTPSecret() (string, error) {
	secret := make([]byte, 20)
	if _, err := io.ReadFull(rand.Reader, secret); err != nil {
		return "", fmt.Errorf("génération secret TOTP : %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret), nil
}

// ValidateTOTP vérifie un code TOTP à 6 chiffres (fenêtre ±1 période = tolérance horloge 30s).
func ValidateTOTP(secretBase32, code string) bool {
	if len(code) != 6 {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secretBase32)
	if err != nil {
		// Essayer avec padding standard
		key, err = base32.StdEncoding.DecodeString(secretBase32)
		if err != nil {
			return false
		}
	}
	counter := time.Now().Unix() / 30
	for _, delta := range []int64{0, -1, 1} {
		if hotpCode(key, counter+delta) == code {
			return true
		}
	}
	return false
}

// hotpCode calcule un code HOTP (RFC 4226) pour un compteur donné.
func hotpCode(key []byte, counter int64) string {
	msg := make([]byte, 8)
	binary.BigEndian.PutUint64(msg, uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(msg)
	h := mac.Sum(nil)
	offset := h[len(h)-1] & 0x0f
	code := (int64(h[offset]&0x7f)<<24 |
		int64(h[offset+1])<<16 |
		int64(h[offset+2])<<8 |
		int64(h[offset+3])) % int64(math.Pow10(6))
	return fmt.Sprintf("%06d", code)
}

// TOTPKeyURI retourne l'URI otpauth:// pour générer un QR code compatible Google Authenticator.
func TOTPKeyURI(issuer, accountName, secret string) string {
	return fmt.Sprintf(
		"otpauth://totp/%s:%s?secret=%s&issuer=%s&digits=6&period=30&algorithm=SHA1",
		url.PathEscape(issuer), url.PathEscape(accountName), url.QueryEscape(secret), url.QueryEscape(issuer),
	)
}

// CurrentTOTPWindow retourne la fenêtre temporelle actuelle (utilisée pour l'anti-replay).
func CurrentTOTPWindow() string {
	return strconv.FormatInt(time.Now().Unix()/30, 10)
}
