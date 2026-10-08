package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAddress           = ":8081"
	defaultHeartbeatInterval = 20 * time.Second
	defaultMaxMessageBytes   = int64(64 * 1024)
	defaultPongTimeout       = 60 * time.Second
	defaultRecoveryTimeout   = 30 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
	defaultWriteTimeout      = 10 * time.Second
)

type Config struct {
	Address                string
	AllowedOrigins         []string
	DatabaseURL            string
	HeartbeatInterval      time.Duration
	InternalSecret         string
	IPInfoToken            string
	MaxMessageBytes        int64
	MediaInternalURL       string
	ParticipantTokenSecret string
	PongTimeout            time.Duration
	RecoveryTimeout        time.Duration
	ShutdownTimeout        time.Duration
	SignalingNodeID        string
	TokenAudience          string
	TokenIssuer            string
	TokenKeyID             string
	WriteTimeout           time.Duration
}

func Load() (Config, error) {
	return load(os.LookupEnv)
}

func load(lookup func(string) (string, bool)) (Config, error) {
	address := valueOrDefault(lookup, "RELAYRTC_SIGNALING_ADDRESS", defaultAddress)
	if _, err := net.ResolveTCPAddr("tcp", address); err != nil {
		return Config{}, fmt.Errorf("invalid signaling address: %w", err)
	}

	heartbeatInterval, err := duration(lookup, "RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL", defaultHeartbeatInterval)
	if err != nil {
		return Config{}, err
	}
	pongTimeout, err := duration(lookup, "RELAYRTC_SIGNALING_PONG_TIMEOUT", defaultPongTimeout)
	if err != nil {
		return Config{}, err
	}
	recoveryTimeout, err := duration(lookup, "RELAYRTC_SIGNALING_RECOVERY_TIMEOUT", defaultRecoveryTimeout)
	if err != nil {
		return Config{}, err
	}
	writeTimeout, err := duration(lookup, "RELAYRTC_SIGNALING_WRITE_TIMEOUT", defaultWriteTimeout)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := duration(lookup, "RELAYRTC_SIGNALING_SHUTDOWN_TIMEOUT", defaultShutdownTimeout)
	if err != nil {
		return Config{}, err
	}
	if heartbeatInterval >= pongTimeout {
		return Config{}, fmt.Errorf("RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL must be shorter than RELAYRTC_SIGNALING_PONG_TIMEOUT")
	}

	maxMessageBytes, err := positiveInt64(lookup, "RELAYRTC_SIGNALING_MAX_MESSAGE_BYTES", defaultMaxMessageBytes)
	if err != nil {
		return Config{}, err
	}

	secret, _ := lookup("PARTICIPANT_TOKEN_SIGNING_SECRET")
	if len(secret) < 32 {
		return Config{}, fmt.Errorf("PARTICIPANT_TOKEN_SIGNING_SECRET must contain at least 32 characters")
	}
	internalSecret, present := lookup("RELAYRTC_INTERNAL_SECRET")
	if !present {
		internalSecret = "development-internal-secret-change-me"
	}
	if len(internalSecret) < 32 {
		return Config{}, fmt.Errorf("RELAYRTC_INTERNAL_SECRET must contain at least 32 characters")
	}
	databaseURL, _ := lookup("DATABASE_URL")
	if strings.TrimSpace(databaseURL) == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	mediaInternalURL := valueOrDefault(lookup, "RELAYRTC_MEDIA_INTERNAL_URL", "http://media:8082/internal/v1")
	parsedMediaURL, err := url.Parse(mediaInternalURL)
	if err != nil || (parsedMediaURL.Scheme != "http" && parsedMediaURL.Scheme != "https") || parsedMediaURL.Host == "" || parsedMediaURL.User != nil || parsedMediaURL.RawQuery != "" || parsedMediaURL.Fragment != "" {
		return Config{}, fmt.Errorf("RELAYRTC_MEDIA_INTERNAL_URL must be a valid HTTP URL")
	}

	nodeEnvironment := valueOrDefault(lookup, "NODE_ENV", "development")
	if nodeEnvironment != "development" && nodeEnvironment != "test" && nodeEnvironment != "production" {
		return Config{}, fmt.Errorf("NODE_ENV must be development, test, or production")
	}
	if err := validateCredentials(lookup, nodeEnvironment, secret, internalSecret, databaseURL); err != nil {
		return Config{}, err
	}

	allowedOrigins := splitList(valueOrDefault(
		lookup,
		"RELAYRTC_SIGNALING_ALLOWED_ORIGINS",
		"http://localhost:3000,http://localhost:3001",
	))
	if len(allowedOrigins) == 0 {
		return Config{}, fmt.Errorf("RELAYRTC_SIGNALING_ALLOWED_ORIGINS must contain at least one origin")
	}
	for _, origin := range allowedOrigins {
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") ||
			parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return Config{}, fmt.Errorf("RELAYRTC_SIGNALING_ALLOWED_ORIGINS contains an invalid origin")
		}
	}

	return Config{
		Address:                address,
		AllowedOrigins:         allowedOrigins,
		DatabaseURL:            databaseURL,
		HeartbeatInterval:      heartbeatInterval,
		InternalSecret:         internalSecret,
		IPInfoToken:            strings.TrimSpace(valueOrDefault(lookup, "RELAYRTC_IPINFO_TOKEN", "")),
		MaxMessageBytes:        maxMessageBytes,
		MediaInternalURL:       strings.TrimRight(mediaInternalURL, "/"),
		ParticipantTokenSecret: secret,
		PongTimeout:            pongTimeout,
		RecoveryTimeout:        recoveryTimeout,
		ShutdownTimeout:        shutdownTimeout,
		SignalingNodeID:        valueOrDefault(lookup, "RELAYRTC_SIGNALING_NODE_ID", "signaling-local"),
		TokenAudience:          valueOrDefault(lookup, "PARTICIPANT_TOKEN_AUDIENCE", "relayrtc-realtime"),
		TokenIssuer:            valueOrDefault(lookup, "PARTICIPANT_TOKEN_ISSUER", "relayrtc-api"),
		TokenKeyID:             valueOrDefault(lookup, "PARTICIPANT_TOKEN_KEY_ID", "participant-v1"),
		WriteTimeout:           writeTimeout,
	}, nil
}

func valueOrDefault(lookup func(string) (string, bool), key, fallback string) string {
	if value, ok := lookup(key); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func duration(lookup func(string) (string, bool), key string, fallback time.Duration) (time.Duration, error) {
	value := valueOrDefault(lookup, key, fallback.String())
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", key)
	}
	return parsed, nil
}

func positiveInt64(lookup func(string) (string, bool), key string, fallback int64) (int64, error) {
	value := valueOrDefault(lookup, key, strconv.FormatInt(fallback, 10))
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func splitList(value string) []string {
	items := make([]string, 0)
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			items = append(items, trimmed)
		}
	}
	return items
}

func placeholderCredential(value string) bool {
	lower := strings.ToLower(value)
	for _, prefix := range []string{"replace-with", "development-", "test-", "example-", "placeholder"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	if strings.Contains(lower, "change-me") || strings.Contains(lower, "changeme") {
		return true
	}
	if value == "password" || value == "postgres" || value == "relaykit" || value == "0123456789abcdef0123456789abcdef" {
		return true
	}
	if len(value) > 0 && strings.Trim(value, value[:1]) == "" {
		return true
	}
	return false
}

func validateCredentials(lookup func(string) (string, bool), mode, participant, internal, databaseURL string) error {
	credentials := map[string]string{"PARTICIPANT_TOKEN_SIGNING_SECRET": participant, "RELAYRTC_INTERNAL_SECRET": internal}
	for _, name := range []string{"BETTER_AUTH_SECRET", "TURN_SHARED_SECRET"} {
		if value, ok := lookup(name); ok {
			credentials[name] = value
		}
	}
	for name, value := range credentials {
		if len(value) < 32 || value != strings.TrimSpace(value) {
			return fmt.Errorf("%s must contain at least 32 characters without surrounding whitespace", name)
		}
		if mode == "production" && placeholderCredential(value) {
			return fmt.Errorf("%s must not use a placeholder or development credential in production", name)
		}
		for other, otherValue := range credentials {
			if name != other && value == otherValue {
				return fmt.Errorf("%s and %s must use separate credentials", name, other)
			}
		}
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Host == "" {
		return fmt.Errorf("DATABASE_URL must be a valid PostgreSQL URL")
	}
	if mode == "production" {
		for _, name := range []string{"RELAYRTC_INTERNAL_SECRET", "RELAYRTC_MEDIA_INTERNAL_URL", "RELAYRTC_SIGNALING_ALLOWED_ORIGINS"} {
			value, ok := lookup(name)
			if !ok || strings.TrimSpace(value) == "" {
				return fmt.Errorf("%s is required in production", name)
			}
		}
		if parsed.User == nil {
			return fmt.Errorf("DATABASE_URL must use a non-placeholder password in production")
		}
		password, ok := parsed.User.Password()
		if !ok || password == "" || placeholderCredential(password) {
			return fmt.Errorf("DATABASE_URL must use a non-placeholder password in production")
		}
	}
	return nil
}
