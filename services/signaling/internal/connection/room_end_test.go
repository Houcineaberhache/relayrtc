package connection

import (
	"context"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

func TestHandlerEndsRoomAndDisconnectsJoinedParticipants(t *testing.T) {
	shutdown, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	handler, server := recoveryHandler(t, shutdown, store, time.Second, nil)
	token := connectionToken(t, time.Now().Add(time.Minute))
	client, _, err := dial(t, server, token, "")
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer client.Close()
	joinTestSession(t, client, token, now)
	endedAt := time.Now().UTC()
	room := session.Room{
		ID: "room_123", ProjectID: "project_123", EnvironmentID: "env_development",
		Name: "Room", Metadata: []byte(`{}`), Status: "ended", MaxParticipants: 10,
		CreatedAt: now, StartedAt: &now, EndedAt: &endedAt,
	}

	if err := handler.EndRoom(context.Background(), room); err != nil {
		t.Fatalf("EndRoom() error = %v", err)
	}
	event := map[string]any{}
	if err := client.ReadJSON(&event); err != nil {
		t.Fatalf("ReadJSON(room ended) error = %v", err)
	}
	if event["type"] != "room.ended" {
		t.Fatalf("event type = %v, want room.ended", event["type"])
	}
	_, _, err = client.NextReader()
	closeError, ok := err.(*websocket.CloseError)
	if !ok || closeError.Code != closeRoomEnded {
		t.Fatalf("close error = %v, want code %d", err, closeRoomEnded)
	}
}
