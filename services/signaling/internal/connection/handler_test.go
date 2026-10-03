package connection

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

const connectionTestSecret = "a-secure-participant-token-secret-123"

func connectionToken(t *testing.T, expiresAt time.Time) string {
	return connectionTokenWithPermissions(t, expiresAt, []string{"room:join"})
}

func connectionTokenWithPermissions(t *testing.T, expiresAt time.Time, permissions []string) string {
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
		Permissions:     permissions,
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

type fakeSessionStore struct {
	joinResult   session.JoinResult
	left         chan struct{}
	disconnected chan struct{}
	expired      chan struct{}
	resumeResult session.ResumeResult
}

type fakeRTCService struct {
	requests chan RTCSignalRequest
}

func (service *fakeRTCService) Handle(_ context.Context, _ auth.Claims, request RTCSignalRequest) (RTCSignalResponse, error) {
	service.requests <- request
	return RTCSignalResponse{
		Type:    "rtc.capabilities",
		Payload: map[string]any{"routerCapabilities": map[string]any{"codecs": []any{}}},
	}, nil
}

func (store *fakeSessionStore) Join(context.Context, auth.Claims, string, string) (session.JoinResult, error) {
	return store.joinResult, nil
}

func (store *fakeSessionStore) Leave(context.Context, string, string, string) (time.Time, error) {
	select {
	case store.left <- struct{}{}:
	default:
	}
	return time.Now().UTC(), nil
}

func (store *fakeSessionStore) Disconnect(context.Context, string, string) (time.Time, error) {
	if store.disconnected != nil {
		select {
		case store.disconnected <- struct{}{}:
		default:
		}
	}
	return time.Now().UTC(), nil
}

func (store *fakeSessionStore) Resume(context.Context, auth.Claims, string, string, time.Time) (session.ResumeResult, error) {
	return store.resumeResult, nil
}

func (store *fakeSessionStore) Expire(context.Context, string, string, string) (time.Time, error) {
	if store.expired != nil {
		select {
		case store.expired <- struct{}{}:
		default:
		}
	}
	return time.Now().UTC(), nil
}

func (store *fakeSessionStore) UpdateMetadata(
	_ context.Context,
	roomID, participantID, _ string,
	metadata json.RawMessage,
) (session.Participant, error) {
	participant := store.joinResult.Participant
	participant.RoomID = roomID
	participant.ID = participantID
	participant.Metadata = metadata
	store.joinResult.Participant = participant
	return participant, nil
}

func (store *fakeSessionStore) EndRoom(context.Context, string, time.Time) error {
	return nil
}

func TestHandlerJoinsDiscoversAndLeavesRoom(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	participant := session.Participant{
		ID: "participant_123", RoomID: "room_123", Name: "Ada",
		Metadata: []byte(`{}`), Role: "participant", JoinedAt: now,
	}
	store := &fakeSessionStore{
		joinResult: session.JoinResult{
			Room: session.Room{
				ID: "room_123", ProjectID: "project_123", EnvironmentID: "env_development",
				Name: "Room", Metadata: []byte(`{}`), Status: "active", MaxParticipants: 10,
				CreatedAt: now, StartedAt: &now,
			},
			Participant: participant,
			Session: session.ParticipantSession{
				ID: "session_123", ParticipantID: participant.ID, SignalingNodeID: "signaling-test",
				ConnectionState: "connected", TransportType: "tcp", JoinedAt: now,
			},
			Participants: []session.Participant{participant},
		},
		left: make(chan struct{}, 1),
	}
	rtcService := &fakeRTCService{requests: make(chan RTCSignalRequest, 1)}
	handler := NewHandler(Options{
		AllowedOrigins: []string{"https://app.example.com"}, HeartbeatInterval: time.Second,
		MaxMessageBytes: 4096, NodeID: "signaling-test", PongTimeout: 2 * time.Second,
		RTCService: rtcService, SessionStore: store, Shutdown: shutdown,
		Validator:    auth.NewValidator(connectionTestSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"),
		WriteTimeout: time.Second,
	})
	server := httptest.NewServer(handler)
	defer server.Close()
	token := connectionToken(t, time.Now().Add(time.Minute))
	connection, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_join", "sentAt": now, "type": "participant.join",
		"payload": map[string]any{"roomId": "room_123", "participantToken": token},
	}); err != nil {
		t.Fatalf("WriteJSON(join) error = %v", err)
	}
	response := map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(join) error = %v", err)
	}
	if response["type"] != "participant.join.accepted" {
		t.Fatalf("join response type = %v", response["type"])
	}
	payload := response["payload"].(map[string]any)
	if len(payload["participants"].([]any)) != 1 {
		t.Fatalf("join participants = %v", payload["participants"])
	}

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_wrong_session", "sentAt": now, "type": "rtc.capabilities.get",
		"payload": map[string]any{"roomId": "room_123", "sessionId": "session_other"},
	}); err != nil {
		t.Fatalf("WriteJSON(wrong session) error = %v", err)
	}
	response = map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(wrong session) error = %v", err)
	}
	if response["type"] != "protocol.error" {
		t.Fatalf("wrong session response type = %v", response["type"])
	}

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_capabilities", "sentAt": now, "type": "rtc.capabilities.get",
		"payload": map[string]any{"roomId": "room_123", "sessionId": "session_123"},
	}); err != nil {
		t.Fatalf("WriteJSON(capabilities) error = %v", err)
	}
	response = map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(capabilities) error = %v", err)
	}
	if response["type"] != "rtc.capabilities" {
		t.Fatalf("capabilities response type = %v", response["type"])
	}
	select {
	case request := <-rtcService.requests:
		if request.RoomID != "room_123" || request.SessionID != "session_123" ||
			request.ParticipantID != "participant_123" {
			t.Fatalf("RTC request scope = %+v", request)
		}
	case <-time.After(time.Second):
		t.Fatal("RTC request was not dispatched")
	}

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_leave", "sentAt": now, "type": "participant.leave",
		"payload": map[string]any{"roomId": "room_123", "participantId": "participant_123", "sessionId": "session_123"},
	}); err != nil {
		t.Fatalf("WriteJSON(leave) error = %v", err)
	}
	response = map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(leave) error = %v", err)
	}
	if response["type"] != "participant.leave.accepted" {
		t.Fatalf("leave response type = %v", response["type"])
	}
	select {
	case <-store.left:
	case <-time.After(time.Second):
		t.Fatal("leave was not persisted")
	}
}

func recoverySessionStore(now time.Time) *fakeSessionStore {
	participant := session.Participant{
		ID: "participant_123", RoomID: "room_123", Name: "Ada",
		Metadata: []byte(`{}`), Role: "participant", JoinedAt: now,
	}
	participantSession := session.ParticipantSession{
		ID: "session_123", ParticipantID: participant.ID, SignalingNodeID: "signaling-test",
		ConnectionState: "connected", TransportType: "tcp", JoinedAt: now,
	}
	reconnectedAt := now.Add(time.Second)
	resumedSession := participantSession
	resumedSession.ReconnectedAt = &reconnectedAt
	return &fakeSessionStore{
		joinResult: session.JoinResult{
			Room: session.Room{
				ID: "room_123", ProjectID: "project_123", EnvironmentID: "env_development",
				Name: "Room", Metadata: []byte(`{}`), Status: "active", MaxParticipants: 10,
				CreatedAt: now, StartedAt: &now,
			},
			Participant: participant, Session: participantSession,
			Participants: []session.Participant{participant},
		},
		resumeResult: session.ResumeResult{
			Participant: participant, Session: resumedSession,
			Participants: []session.Participant{participant},
		},
		left: make(chan struct{}, 1), disconnected: make(chan struct{}, 2),
		expired: make(chan struct{}, 2),
	}
}

func recoveryHandler(t *testing.T, shutdown context.Context, store SessionStore, timeout time.Duration) (*Handler, *httptest.Server) {
	t.Helper()
	handler := NewHandler(Options{
		AllowedOrigins: []string{"https://app.example.com"}, HeartbeatInterval: time.Second,
		MaxMessageBytes: 4096, NodeID: "signaling-test", PongTimeout: 2 * time.Second,
		RecoveryTimeout: timeout, SessionStore: store, Shutdown: shutdown,
		Validator:    auth.NewValidator(connectionTestSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"),
		WriteTimeout: time.Second,
	})
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return handler, server
}

func joinTestSession(t *testing.T, connection *websocket.Conn, token string, now time.Time) {
	t.Helper()
	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_join", "sentAt": now, "type": "participant.join",
		"payload": map[string]any{"roomId": "room_123", "participantToken": token},
	}); err != nil {
		t.Fatalf("WriteJSON(join) error = %v", err)
	}
	response := map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(join) error = %v", err)
	}
	if response["type"] != "participant.join.accepted" {
		t.Fatalf("join response type = %v", response["type"])
	}
}

func TestHandlerResumesDisconnectedSessionAndRejectsDuplicateResume(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	_, server := recoveryHandler(t, shutdown, store, 200*time.Millisecond)
	token := connectionToken(t, time.Now().Add(time.Minute))

	first, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial(first) error = %v", err)
	}
	joinTestSession(t, first, token, now)
	_ = first.Close()
	select {
	case <-store.disconnected:
	case <-time.After(time.Second):
		t.Fatal("session was not marked reconnecting")
	}

	resumed, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial(resumed) error = %v", err)
	}
	defer resumed.Close()
	if err := resumed.WriteJSON(map[string]any{
		"v": 1, "id": "request_resume", "sentAt": now, "type": "session.resume",
		"payload": map[string]any{
			"roomId": "room_123", "sessionId": "session_123", "resumeToken": token,
		},
	}); err != nil {
		t.Fatalf("WriteJSON(resume) error = %v", err)
	}
	response := map[string]any{}
	if err := resumed.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(resume) error = %v", err)
	}
	if response["type"] != "session.resume.accepted" {
		t.Fatalf("resume response type = %v", response["type"])
	}

	duplicate, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial(duplicate) error = %v", err)
	}
	defer duplicate.Close()
	if err := duplicate.WriteJSON(map[string]any{
		"v": 1, "id": "request_duplicate", "sentAt": now, "type": "session.resume",
		"payload": map[string]any{
			"roomId": "room_123", "sessionId": "session_123", "resumeToken": token,
		},
	}); err != nil {
		t.Fatalf("WriteJSON(duplicate) error = %v", err)
	}
	response = map[string]any{}
	if err := duplicate.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON(duplicate) error = %v", err)
	}
	if response["type"] != "protocol.error" {
		t.Fatalf("duplicate response type = %v", response["type"])
	}

	select {
	case <-store.expired:
		t.Fatal("resumed session was expired")
	case <-time.After(250 * time.Millisecond):
	}
}

func TestHandlerExpiresSessionAfterRecoveryTimeout(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	_, server := recoveryHandler(t, shutdown, store, 30*time.Millisecond)
	token := connectionToken(t, time.Now().Add(time.Minute))
	connection, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	joinTestSession(t, connection, token, now)
	_ = connection.Close()

	select {
	case <-store.expired:
	case <-time.After(time.Second):
		t.Fatal("recovery timeout did not expire the session")
	}
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
