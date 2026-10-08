package config

import (
	"strings"
	"testing"
	"time"
)

func testEnvironment(overrides map[string]string) func(string) (string, bool) {
	values := map[string]string{
		"DATABASE_URL":                     "postgresql://relayrtc:password@localhost:5432/relayrtc",
		"PARTICIPANT_TOKEN_SIGNING_SECRET": "a-secure-participant-token-secret-123",
	}
	for key, value := range overrides {
		values[key] = value
	}
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func TestLoadUsesSafeDefaults(t *testing.T) {
	cfg, err := load(testEnvironment(nil))
	if err != nil {
		t.Fatalf("load() returned an error: %v", err)
	}

	if cfg.Address != defaultAddress || cfg.HeartbeatInterval != 20*time.Second ||
		cfg.RecoveryTimeout != 30*time.Second {
		t.Fatalf("load() returned unexpected defaults: %+v", cfg)
	}
	if cfg.TokenAudience != "relayrtc-realtime" || cfg.TokenIssuer != "relayrtc-api" || cfg.TokenKeyID != "participant-v1" {
		t.Fatalf("load() returned unexpected token configuration: %+v", cfg)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Fatalf("load() allowed origins = %v, want two local origins", cfg.AllowedOrigins)
	}
}

func TestLoadUsesConfiguredConnectionSettings(t *testing.T) {
	cfg, err := load(testEnvironment(map[string]string{
		"RELAYRTC_SIGNALING_ADDRESS":            "127.0.0.1:9091",
		"RELAYRTC_SIGNALING_ALLOWED_ORIGINS":    "https://app.example.com",
		"RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL": "15s",
		"RELAYRTC_SIGNALING_MAX_MESSAGE_BYTES":  "32768",
		"RELAYRTC_SIGNALING_PONG_TIMEOUT":       "45s",
		"RELAYRTC_SIGNALING_RECOVERY_TIMEOUT":   "20s",
		"RELAYRTC_MEDIA_INTERNAL_URL":           "https://media.example.com/internal/v1/",
	}))
	if err != nil {
		t.Fatalf("load() returned an error: %v", err)
	}

	if cfg.Address != "127.0.0.1:9091" || cfg.MaxMessageBytes != 32768 ||
		cfg.RecoveryTimeout != 20*time.Second {
		t.Fatalf("load() returned unexpected settings: %+v", cfg)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "https://app.example.com" {
		t.Fatalf("load() allowed origins = %v", cfg.AllowedOrigins)
	}
	if cfg.MediaInternalURL != "https://media.example.com/internal/v1" {
		t.Fatalf("load() media URL = %s", cfg.MediaInternalURL)
	}
}

func TestLoadRejectsInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name      string
		overrides map[string]string
		contains  string
	}{
		{"address", map[string]string{"RELAYRTC_SIGNALING_ADDRESS": "invalid-address"}, "address"},
		{"heartbeat", map[string]string{"RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL": "60s"}, "shorter"},
		{"message size", map[string]string{"RELAYRTC_SIGNALING_MAX_MESSAGE_BYTES": "0"}, "positive integer"},
		{"recovery timeout", map[string]string{"RELAYRTC_SIGNALING_RECOVERY_TIMEOUT": "0s"}, "positive duration"},
		{"origin", map[string]string{"RELAYRTC_SIGNALING_ALLOWED_ORIGINS": "https://example.com/path"}, "invalid origin"},
		{"secret", map[string]string{"PARTICIPANT_TOKEN_SIGNING_SECRET": "too-short"}, "32 characters"},
		{"media URL", map[string]string{"RELAYRTC_MEDIA_INTERNAL_URL": "file:///tmp/media"}, "HTTP URL"},
		{"media URL credentials", map[string]string{"RELAYRTC_MEDIA_INTERNAL_URL": "http://user:private-value@media/internal/v1"}, "HTTP URL"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := load(testEnvironment(test.overrides))
			if err == nil || !strings.Contains(err.Error(), test.contains) {
				t.Fatalf("load() error = %v, want error containing %q", err, test.contains)
			}
		})
	}
}

func TestCredentialsAreSeparatedInLocalMode(t *testing.T) {
	cfg, err := load(testEnvironment(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.InternalSecret == cfg.ParticipantTokenSecret || cfg.InternalSecret != "development-internal-secret-change-me" {
		t.Fatal("local control secret was not separated")
	}
	_, err = load(testEnvironment(map[string]string{"RELAYRTC_INTERNAL_SECRET": "a-secure-participant-token-secret-123"}))
	if err == nil || !strings.Contains(err.Error(), "separate credentials") {
		t.Fatal("reused credential accepted")
	}
}

func TestProductionConfigurationMatrix(t *testing.T) {
	base := map[string]string{
		"NODE_ENV":                           "production",
		"DATABASE_URL":                       "postgresql://relayrtc:independent-database-password@postgres/relayrtc",
		"RELAYRTC_INTERNAL_SECRET":           "independent-internal-control-key-456",
		"RELAYRTC_MEDIA_INTERNAL_URL":        "http://media:8082/internal/v1",
		"RELAYRTC_SIGNALING_ALLOWED_ORIGINS": "https://app.example.com",
	}
	if _, err := load(testEnvironment(base)); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"RELAYRTC_INTERNAL_SECRET", "RELAYRTC_MEDIA_INTERNAL_URL", "RELAYRTC_SIGNALING_ALLOWED_ORIGINS"} {
		t.Run("missing/"+name, func(t *testing.T) {
			values := map[string]string{}
			for key, value := range base {
				values[key] = value
			}
			values[name] = ""
			if _, err := load(testEnvironment(values)); err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("missing production setting accepted: %v", err)
			}
		})
	}
	for _, name := range []string{"RELAYRTC_INTERNAL_SECRET", "PARTICIPANT_TOKEN_SIGNING_SECRET"} {
		t.Run("placeholder/"+name, func(t *testing.T) {
			values := map[string]string{}
			for key, value := range base {
				values[key] = value
			}
			values[name] = "replace-with-at-least-32-random-characters"
			if _, err := load(testEnvironment(values)); err == nil || !strings.Contains(err.Error(), name) || strings.Contains(err.Error(), values[name]) {
				t.Fatalf("placeholder policy failure: %v", err)
			}
		})
	}
	for _, databaseURL := range []string{"postgresql://relaykit:relaykit@postgres/relaykit", "postgresql://postgres/relaykit", "mysql://user:private-password@postgres/database"} {
		values := map[string]string{}
		for key, value := range base {
			values[key] = value
		}
		values["DATABASE_URL"] = databaseURL
		if _, err := load(testEnvironment(values)); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") || strings.Contains(err.Error(), databaseURL) {
			t.Fatalf("unsafe database policy failure: %v", err)
		}
	}
}
