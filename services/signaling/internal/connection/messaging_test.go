package connection

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

func TestHandlerAcceptsTextAndCustomMessagesWithPermission(t *testing.T) {
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
		t, time.Now().Add(time.Minute), []string{"room:join", "messages:send"},
	)
	connection, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer connection.Close()
	joinTestSession(t, connection, token, now)

	tests := []struct {
		name         string
		requestType  string
		responseType string
		payload      map[string]any
	}{
		{
			name: "text", requestType: "message.send", responseType: "message.sent",
			payload: map[string]any{"roomId": "room_123", "sessionId": "session_123", "text": "hello"},
		},
		{
			name: "custom event", requestType: "event.emit", responseType: "event.emitted",
			payload: map[string]any{
				"roomId": "room_123", "sessionId": "session_123",
				"name": "reaction", "data": map[string]any{"emoji": "🔥"},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := connection.WriteJSON(map[string]any{
				"v": 1, "id": "request_message", "sentAt": now,
				"type": test.requestType, "payload": test.payload,
			}); err != nil {
				t.Fatalf("WriteJSON() error = %v", err)
			}
			response := map[string]any{}
			if err := connection.ReadJSON(&response); err != nil {
				t.Fatalf("ReadJSON() error = %v", err)
			}
			if response["type"] != test.responseType {
				t.Fatalf("response type = %v, want %s", response["type"], test.responseType)
			}
			payload := response["payload"].(map[string]any)
			if payload["messageId"] == "" || payload["participantId"] != "participant_123" {
				t.Fatalf("response payload = %v", payload)
			}
		})
	}
}

func TestHandlerRejectsMessagingWithoutPermission(t *testing.T) {
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
		"v": 1, "id": "request_message", "sentAt": now, "type": "message.send",
		"payload": map[string]any{
			"roomId": "room_123", "sessionId": "session_123", "text": "hello",
		},
	}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	response := map[string]any{}
	if err := connection.ReadJSON(&response); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if response["type"] != "protocol.error" {
		t.Fatalf("response type = %v, want protocol.error", response["type"])
	}
	payload := response["payload"].(map[string]any)
	if payload["code"] != "forbidden" {
		t.Fatalf("error code = %v, want forbidden", payload["code"])
	}
}
