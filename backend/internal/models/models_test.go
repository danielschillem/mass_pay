package models

import (
	"strings"
	"testing"

	"masspay-bf/internal/crypto"
)

func TestSensitiveHooksEncryptAndRestoreTenantValues(t *testing.T) {
	key, err := crypto.DecodeHexKey(strings.Repeat("b", 64))
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	crypto.SetDefaultKey(key)
	t.Cleanup(func() { crypto.SetDefaultKey(nil) })

	tenant := Tenant{
		RaisonSociale: "ACME",
		RCCM:          "RCCM-BF-001",
		IFU:           "IFU-BF-001",
	}

	if err := tenant.BeforeCreate(nil); err != nil {
		t.Fatalf("before create: %v", err)
	}
	if tenant.RCCM == "RCCM-BF-001" || tenant.IFU == "IFU-BF-001" {
		t.Fatalf("tenant sensitive values were not encrypted")
	}
	if tenant.IFUHash != crypto.HashField("IFU-BF-001") {
		t.Fatalf("tenant IFU hash mismatch")
	}

	if err := tenant.AfterSave(nil); err != nil {
		t.Fatalf("after save: %v", err)
	}
	if tenant.RCCM != "RCCM-BF-001" || tenant.IFU != "IFU-BF-001" {
		t.Fatalf("tenant values were not restored after save")
	}

	if err := tenant.BeforeUpdate(nil); err != nil {
		t.Fatalf("before update: %v", err)
	}
	if got := crypto.PlainField(tenant.IFU); got != "IFU-BF-001" {
		t.Fatalf("tenant IFU after update decrypts to %q", got)
	}
}

func TestSensitiveHooksEncryptAndRestoreBeneficiaryPhone(t *testing.T) {
	key, err := crypto.DecodeHexKey(strings.Repeat("c", 64))
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	crypto.SetDefaultKey(key)
	t.Cleanup(func() { crypto.SetDefaultKey(nil) })

	beneficiary := Beneficiary{
		PhoneNumber: "22670123456",
		FullName:    "Alice Test",
	}

	if err := beneficiary.BeforeCreate(nil); err != nil {
		t.Fatalf("before create: %v", err)
	}
	if beneficiary.PhoneNumber == "22670123456" {
		t.Fatalf("beneficiary phone was not encrypted")
	}
	if beneficiary.PhoneHash != crypto.HashField("22670123456") {
		t.Fatalf("beneficiary phone hash mismatch")
	}

	if err := beneficiary.AfterSave(nil); err != nil {
		t.Fatalf("after save: %v", err)
	}
	if beneficiary.PhoneNumber != "22670123456" {
		t.Fatalf("beneficiary phone was not restored after save")
	}
}
