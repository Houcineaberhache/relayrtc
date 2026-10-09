package connection

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
	"github.com/relayrtc/relayrtc/services/signaling/internal/rtc"
)

type runtimeTestService struct {
	failure error
	removed chan [3]string
	closed  chan string
}

func (service *runtimeTestService) Handle(context.Context, auth.Claims, RTCSignalRequest) (RTCSignalResponse, error) {
	return RTCSignalResponse{}, service.failure
}

func (service *runtimeTestService) RemoveSession(_ context.Context, roomID, participantID, sessionID string) error {
	service.removed <- [3]string{roomID, participantID, sessionID}
	return nil
}

func (service *runtimeTestService) CloseRoom(_ context.Context, roomID string) error {
	service.closed <- roomID
	return service.failure
}

func TestHandlerMapsTypedRuntimeFailures(t *testing.T) {
	for _, failure := range []error{rtc.ErrForbidden, rtc.ErrInvalidRequest, rtc.ErrUnsupported, rtc.ErrRequestConflict, rtc.ErrUnavailable} {
		t.Run(failure.Error(), func(t *testing.T) {
			shutdown, cancel := context.WithCancel(context.Background())
			defer cancel()
			now := time.Now().UTC()
			handler := NewHandler(Options{
				HeartbeatInterval: time.Second, PongTimeout: 3 * time.Second, WriteTimeout: time.Second,
				MaxMessageBytes: 4096, NodeID: "signaling-test", Shutdown: shutdown,
				SessionStore: recoverySessionStore(now), RTCService: &runtimeTestService{failure: failure, removed: make(chan [3]string, 1), closed: make(chan string, 1)},
				Validator: auth.NewValidator(connectionTestSecret, "relayrtc-api", "relayrtc-realtime", "participant-v1"),
			})
			server := httptest.NewServer(handler)
			defer server.Close()
			token := connectionToken(t, now.Add(time.Minute))
			client, _, err := dial(t, server, token, "")
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			joinTestSession(t, client, token, now)
			if err := client.WriteJSON(map[string]any{"v": 1, "id": "runtime_failure", "sentAt": now, "type": "rtc.capabilities.get", "payload": map[string]any{"roomId": "room_123", "sessionId": "session_123"}}); err != nil {
				t.Fatal(err)
			}
			var response map[string]any
			if err := client.ReadJSON(&response); err != nil {
				t.Fatal(err)
			}
			if response["type"] != "protocol.error" || response["requestId"] != "runtime_failure" || response["payload"].(map[string]any)["code"] != rtc.FailureFor(failure).Code {
				t.Fatal("runtime error lost its public code or request ID")
			}
		})
	}
}

func TestHandlerUsesSessionRuntimeCleanupAndRoomFence(t *testing.T) {
	now := time.Now().UTC()
	store := recoverySessionStore(now)
	failure := errors.New("runtime close failed")
	runtime := &runtimeTestService{failure: failure, removed: make(chan [3]string, 1), closed: make(chan string, 1)}
	handler := NewHandler(Options{SessionStore: store, RTCService: runtime})
	handler.finalizeSession(context.Background(), "room_123", &joinedSession{participant: store.joinResult.Participant, session: store.joinResult.Session})
	if scope := <-runtime.removed; scope != [3]string{"room_123", "participant_123", "session_123"} {
		t.Fatal("cleanup lost the session boundary")
	}
	room := store.joinResult.Room
	room.Status, room.EndedAt = "ended", &now
	if err := handler.EndRoom(context.Background(), room); !errors.Is(err, failure) {
		t.Fatal("runtime close failure was hidden")
	}
	if roomID := <-runtime.closed; roomID != "room_123" {
		t.Fatal("wrong runtime room was fenced")
	}
}
