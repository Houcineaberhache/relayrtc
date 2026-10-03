package connection

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

func TestHandlerUpdatesParticipantMetadataWithPermission(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	handler := NewHandler(Options{
		AllowedOrigins: []string{"https://app.example.com"}, HeartbeatInterval: time.Second,
		MaxMessageBytes: 8192, NodeID: "signaling-test", PongTimeout: 2 * time.Second,
		SessionStore: store, Shutdown: shutdown,
		Validator:    auth.NewValidator(connectionTestSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"),
		WriteTimeout: time.Second,
	})
	server := httptest.NewServer(handler)
	defer server.Close()
	token := connectionTokenWithPermissions(
		t, time.Now().Add(time.Minute), []string{"room:join", "metadata:update"},
	)
	connection, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()
	joinTestSession(t, connection, token, now)

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_presence", "sentAt": now,
		"type": "participant.metadata.update",
		"payload": map[string]any{
			"roomId": "room_123", "participantId": "participant_123",
			"sessionId": "session_123",
			"metadata":  map[string]any{"handRaised": true, "status": "speaking"},
		},
	}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	response := map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if response["type"] != "participant.metadata.update.accepted" {
		t.Fatalf("response type = %v", response["type"])
	}
	participant := response["payload"].(map[string]any)["participant"].(map[string]any)
	metadata := participant["metadata"].(map[string]any)
	if metadata["handRaised"] != true || metadata["status"] != "speaking" {
		t.Fatalf("participant metadata = %v", metadata)
	}
}

func TestHandlerRejectsMetadataUpdatesWithoutPermission(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	_, server := recoveryHandler(t, shutdown, store, time.Second)
	token := connectionToken(t, time.Now().Add(time.Minute))
	connection, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()
	joinTestSession(t, connection, token, now)

	if err := connection.WriteJSON(map[string]any{
		"v": 1, "id": "request_presence", "sentAt": now,
		"type": "participant.metadata.update",
		"payload": map[string]any{
			"roomId": "room_123", "participantId": "participant_123",
			"sessionId": "session_123", "metadata": map[string]any{},
		},
	}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	response := map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	payload := response["payload"].(map[string]any)
	if response["type"] != "protocol.error" || payload["code"] != "forbidden" {
		t.Fatalf("response = %v", response)
	}
}
