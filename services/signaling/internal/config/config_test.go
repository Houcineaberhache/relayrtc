package config

import "testing"

func TestLoadUsesDefaultAddress(t *testing.T) {
	t.Setenv("RELAYKIT_SIGNALING_ADDRESS", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned an error: %v", err)
	}

	if cfg.Address != defaultAddress {
		t.Fatalf("Load() address = %q, want %q", cfg.Address, defaultAddress)
	}
}

func TestLoadUsesConfiguredAddress(t *testing.T) {
	t.Setenv("RELAYKIT_SIGNALING_ADDRESS", "127.0.0.1:9090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned an error: %v", err)
	}

	if cfg.Address != "127.0.0.1:9090" {
		t.Fatalf("Load() address = %q, want %q", cfg.Address, "127.0.0.1:9090")
	}
}

func TestLoadRejectsInvalidAddress(t *testing.T) {
	t.Setenv("RELAYKIT_SIGNALING_ADDRESS", "invalid-address")

	if _, err := Load(); err == nil {
		t.Fatal("Load() returned no error for an invalid address")
	}
}
