package connection

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

const connectionTestSecret = "a-secure-participant-token-secret-123"

func connectionToken(t *testing.T, expiresAt time.Time) string {
	t.Helper()
	issuedAt := time.Now().UTC().Add(-time.Second).Truncate(time.Second)
	expiresAt = expiresAt.UTC().Truncate(time.Second)
	claims := auth.Claims{
		EnvironmentID:   "env_development",
		ExpiresAtISO:    expiresAt.Format(time.RFC3339Nano),
		IssuedAtISO:     issuedAt.Format(time.RFC3339Nano),
		Metadata:        map[string]any{},
		ParticipantID:   "participant_123",
		ParticipantName: "Ada",
		Permissions:     []string{"room:join"},
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
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = "participant-v1"
	signed, err := token.SignedString([]byte(connectionTestSecret))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return signed
}

func testHandler(t *testing.T, shutdown context.Context) (*Handler, *httptest.Server) {
	t.Helper()
	handler := NewHandler(Options{
		AllowedOrigins:    []string{"https://app.example.com"},
		HeartbeatInterval: 20 * time.Millisecond,
		MaxMessageBytes:   1024,
		PongTimeout:       200 * time.Millisecond,
		Shutdown:          shutdown,
		Validator: auth.NewValidator(
			connectionTestSecret,
			"relayrtc-api",
			"relayrtc-realtime",
			"participant-v1",
		),
		WriteTimeout: 100 * time.Millisecond,
	})
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return handler, server
}

func websocketURL(server *httptest.Server) string {
	return "ws" + strings.TrimPrefix(server.URL, "http")
}

func dial(t *testing.T, server *httptest.Server, token, origin string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	dialer := websocket.Dialer{
		HandshakeTimeout: time.Second,
		Subprotocols:     []string{protocolVersion, "relayrtc.token." + token},
	}
	header := http.Header{}
	if origin != "" {
		header.Set("Origin", origin)
	}
	return dialer.Dial(websocketURL(server), header)
}

func TestHandlerAcceptsAuthenticatedConnectionsAndHeartbeats(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	handler, server := testHandler(t, shutdown)
	connection, _, err := dial(
		t,
		server,
		connectionToken(t, time.Now().Add(time.Minute)),
		"https://app.example.com",
	)
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()
	if connection.Subprotocol() != protocolVersion {
		t.Fatalf("Subprotocol() = %q, want %q", connection.Subprotocol(), protocolVersion)
	}

	ping := make(chan struct{}, 1)
	connection.SetPingHandler(func(payload string) error {
		select {
		case ping <- struct{}{}:
		default:
		}
		return connection.WriteControl(
			websocket.PongMessage,
			[]byte(payload),
			time.Now().Add(time.Second),
		)
	})
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		_, _, _ = connection.NextReader()
	}()

	select {
	case <-ping:
	case <-time.After(time.Second):
		t.Fatal("connection did not receive a heartbeat ping")
	}
	if handler.ActiveConnections() != 1 {
		t.Fatalf("ActiveConnections() = %d, want 1", handler.ActiveConnections())
	}

	_ = connection.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "done"),
		time.Now().Add(time.Second),
	)
	select {
	case <-readDone:
	case <-time.After(time.Second):
		t.Fatal("client read did not stop")
	}
	eventually(t, func() bool { return handler.ActiveConnections() == 0 })
}

func TestHandlerRejectsInvalidTokenAndOrigin(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, server := testHandler(t, shutdown)

	_, response, err := dial(t, server, "invalid", "https://app.example.com")
	if err == nil || response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Dial() invalid token response = %v, error = %v", response, err)
	}
	_ = response.Body.Close()

	_, response, err = dial(
		t,
		server,
		connectionToken(t, time.Now().Add(time.Minute)),
		"https://malicious.example.com",
	)
	if err == nil || response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("Dial() invalid origin response = %v, error = %v", response, err)
	}
	_ = response.Body.Close()
}

func TestHandlerDisconnectsExpiredTokens(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	handler, server := testHandler(t, shutdown)
	connection, _, err := dial(t, server, connectionToken(t, time.Now().Add(time.Second)), "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()

	_, _, err = connection.NextReader()
	closeError, ok := err.(*websocket.CloseError)
	if !ok || closeError.Code != closeTokenExpired {
		t.Fatalf("NextReader() error = %v, want close code %d", err, closeTokenExpired)
	}
	eventually(t, func() bool { return handler.ActiveConnections() == 0 })
}

func TestHandlerDisconnectsOnShutdown(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	handler, server := testHandler(t, shutdown)
	connection, _, err := dial(t, server, connectionToken(t, time.Now().Add(time.Minute)), "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()
	cancel()

	_, _, err = connection.NextReader()
	closeError, ok := err.(*websocket.CloseError)
	if !ok || closeError.Code != websocket.CloseGoingAway {
		t.Fatalf("NextReader() error = %v, want close code %d", err, websocket.CloseGoingAway)
	}
	eventually(t, func() bool { return handler.ActiveConnections() == 0 })
}

func eventually(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition was not satisfied before timeout")
}
