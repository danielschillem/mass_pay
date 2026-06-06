package crypto

import (
	"strings"
	"testing"
)

func TestEncryptFieldKeepsHashStableForEncryptedInput(t *testing.T) {
	key, err := DecodeHexKey(strings.Repeat("a", 64))
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	SetDefaultKey(key)
	t.Cleanup(func() { SetDefaultKey(nil) })

	const plain = "22670123456"
	encrypted := EncryptField(plain)
	if encrypted == plain {
		t.Fatalf("EncryptField returned plaintext")
	}
	if got := PlainField(encrypted); got != plain {
		t.Fatalf("PlainField(encrypted) = %q, want %q", got, plain)
	}

	encryptedAgain := EncryptField(encrypted)
	if got := PlainField(encryptedAgain); got != plain {
		t.Fatalf("PlainField(encryptedAgain) = %q, want %q", got, plain)
	}
	if HashField(encryptedAgain) != HashField(plain) {
		t.Fatalf("HashField should be stable for plaintext and encrypted values")
	}
}
