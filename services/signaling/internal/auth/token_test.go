package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "a-secure-participant-token-secret-123"

func signedToken(t *testing.T, mutate func(*Claims)) string {
	t.Helper()
	issuedAt := time.Now().UTC().Truncate(time.Second)
	expiresAt := issuedAt.Add(10 * time.Minute)
	claims := Claims{
		EnvironmentID:   "env_development",
		ExpiresAtISO:    expiresAt.Format(time.RFC3339Nano),
		IssuedAtISO:     issuedAt.Format(time.RFC3339Nano),
		Metadata:        map[string]any{},
		ParticipantID:   "participant_123",
		ParticipantName: "Ada",
		Permissions:     []string{"room:join", "audio:publish"},
		ProjectID:       "project_123",
		RoomID:          "room_123",
		TokenID:         "ptok_123",
		RegisteredClaims: jwt.RegisteredClaims{
			Audience:  jwt.ClaimStrings{"relayrtc-realtime"},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        "ptok_123",
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			Issuer:    "relayrtc-api",
			Subject:   "participant_123",
		},
	}
	if mutate != nil {
		mutate(&claims)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = "participant-v1"
	signed, err := token.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return signed
}

func TestValidatorAcceptsScopedParticipantToken(t *testing.T) {
	validator := NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1")
	claims, err := validator.Validate(signedToken(t, nil))
	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if claims.RoomID != "room_123" || claims.ParticipantID != "participant_123" {
		t.Fatalf("Validate() claims = %+v", claims)
	}
}

func TestValidatorAcceptsISOTimestampsWithMillisecondPrecision(t *testing.T) {
	validator := NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1")
	_, err := validator.Validate(signedToken(t, func(claims *Claims) {
		claims.IssuedAtISO = claims.IssuedAt.Time.Add(723 * time.Millisecond).Format(time.RFC3339Nano)
		claims.ExpiresAtISO = claims.ExpiresAt.Time.Add(723 * time.Millisecond).Format(time.RFC3339Nano)
	}))
	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidatorRejectsInvalidTokens(t *testing.T) {
	tests := []struct {
		name      string
		validator *Validator
		mutate    func(*Claims)
	}{
		{"wrong secret", NewValidator("another-secure-participant-secret-456", "relayrtc-api", "relayrtc-realtime", "participant-v1"), nil},
		{"wrong audience", NewValidator(testSecret, "relayrtc-api", "other-audience", "participant-v1"), nil},
		{"expired", NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"), func(claims *Claims) {
			expired := time.Now().UTC().Add(-time.Minute).Truncate(time.Second)
			claims.ExpiresAt = jwt.NewNumericDate(expired)
			claims.ExpiresAtISO = expired.Format(time.RFC3339Nano)
		}},
		{"missing join", NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"), func(claims *Claims) {
			claims.Permissions = []string{"audio:publish"}
		}},
		{"excessive lifetime", NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"), func(claims *Claims) {
			expiresAt := claims.IssuedAt.Time.Add(2 * time.Hour)
			claims.ExpiresAt = jwt.NewNumericDate(expiresAt)
			claims.ExpiresAtISO = expiresAt.Format(time.RFC3339Nano)
		}},
		{"inconsistent timestamps", NewValidator(testSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"), func(claims *Claims) {
			claims.IssuedAtISO = claims.IssuedAt.Time.Add(time.Second).Format(time.RFC3339Nano)
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := test.validator.Validate(signedToken(t, test.mutate)); err == nil {
				t.Fatal("Validate() returned no error")
			}
		})
	}
}

func TestExtractToken(t *testing.T) {
	if token, ok := ExtractToken("Bearer header-token", nil); !ok || token != "header-token" {
		t.Fatalf("ExtractToken() = %q, %v", token, ok)
	}
	if token, ok := ExtractToken("", []string{"relayrtc.v1", "relayrtc.token.browser-token"}); !ok || token != "browser-token" {
		t.Fatalf("ExtractToken() = %q, %v", token, ok)
	}
	if _, ok := ExtractToken("", []string{"relayrtc.v1"}); ok {
		t.Fatal("ExtractToken() accepted a missing token")
	}
}
