package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid participant token")

var participantPermissions = map[string]struct{}{
	"room:join":       {},
	"audio:publish":   {},
	"video:publish":   {},
	"screen:publish":  {},
	"messages:send":   {},
	"metadata:update": {},
}

type Claims struct {
	EnvironmentID   string         `json:"environmentId"`
	ExpiresAtISO    string         `json:"expiresAt"`
	IssuedAtISO     string         `json:"issuedAt"`
	Metadata        map[string]any `json:"metadata"`
	ParticipantID   string         `json:"participantId"`
	ParticipantName string         `json:"participantName"`
	Permissions     []string       `json:"permissions"`
	ProjectID       string         `json:"projectId"`
	RoomID          string         `json:"roomId"`
	TokenID         string         `json:"tokenId"`
	jwt.RegisteredClaims
}

func (claims Claims) Validate() error {
	if claims.TokenID == "" || claims.ProjectID == "" || claims.EnvironmentID == "" ||
		claims.RoomID == "" || claims.ParticipantID == "" || claims.ParticipantName == "" {
		return fmt.Errorf("required participant claims are missing")
	}
	if claims.ID != claims.TokenID || claims.Subject != claims.ParticipantID {
		return fmt.Errorf("registered identity claims do not match participant claims")
	}
	issuedAtISO, issuedAtError := time.Parse(time.RFC3339Nano, claims.IssuedAtISO)
	expiresAtISO, expiresAtError := time.Parse(time.RFC3339Nano, claims.ExpiresAtISO)
	if claims.IssuedAt == nil || claims.ExpiresAt == nil ||
		issuedAtError != nil || expiresAtError != nil ||
		issuedAtISO.Unix() != claims.IssuedAt.Time.Unix() ||
		expiresAtISO.Unix() != claims.ExpiresAt.Time.Unix() {
		return fmt.Errorf("participant token timestamps are inconsistent")
	}
	if lifetime := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time); lifetime <= 0 || lifetime > time.Hour {
		return fmt.Errorf("participant token lifetime is invalid")
	}
	if claims.Metadata == nil {
		return fmt.Errorf("participant metadata is required")
	}

	permissions := make(map[string]struct{}, len(claims.Permissions))
	for _, permission := range claims.Permissions {
		if _, ok := participantPermissions[permission]; !ok {
			return fmt.Errorf("unknown participant permission")
		}
		if _, duplicate := permissions[permission]; duplicate {
			return fmt.Errorf("participant permissions must be unique")
		}
		permissions[permission] = struct{}{}
	}
	if _, ok := permissions["room:join"]; !ok {
		return fmt.Errorf("room:join permission is required")
	}
	return nil
}

type Validator struct {
	keyID  string
	parser *jwt.Parser
	secret []byte
}

func NewValidator(secret, issuer, audience, keyID string) *Validator {
	return &Validator{
		keyID: keyID,
		parser: jwt.NewParser(
			jwt.WithAudience(audience),
			jwt.WithExpirationRequired(),
			jwt.WithIssuedAt(),
			jwt.WithIssuer(issuer),
			jwt.WithLeeway(5*time.Second),
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		),
		secret: []byte(secret),
	}
}

func (validator *Validator) Validate(raw string) (Claims, error) {
	claims := Claims{}
	token, err := validator.parser.ParseWithClaims(raw, &claims, func(token *jwt.Token) (any, error) {
		keyID, ok := token.Header["kid"].(string)
		if !ok || keyID != validator.keyID {
			return nil, ErrInvalidToken
		}
		return validator.secret, nil
	})
	if err != nil || !token.Valid {
		return Claims{}, ErrInvalidToken
	}
	return claims, nil
}

func ExtractToken(authorization string, protocols []string) (string, bool) {
	if strings.HasPrefix(authorization, "Bearer ") {
		value := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
		if value != "" && !strings.ContainsAny(value, " \t\r\n") {
			return value, true
		}
	}

	const prefix = "relayrtc.token."
	for _, protocol := range protocols {
		if strings.HasPrefix(protocol, prefix) {
			value := strings.TrimPrefix(protocol, prefix)
			if value != "" && !strings.ContainsAny(value, " \t\r\n") {
				return value, true
			}
		}
	}
	return "", false
}
