package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestParticipantMediaClientUsesScopedServiceCredentials(t *testing.T) {
	secret := "test-media-control-secret-at-least-32-characters"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodDelete || request.URL.Path != "/internal/v1/rooms/room_1/participants/participant_1" {
			t.Errorf("unexpected cleanup operation: %s %s", request.Method, request.URL.Path)
		}
		raw := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
		token, err := jwt.Parse(raw, func(token *jwt.Token) (any, error) {
			return []byte(secret), nil
		}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithAudience("relayrtc-media-control"),
			jwt.WithIssuer("relayrtc-signaling"), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
		if err != nil || !token.Valid {
			t.Errorf("invalid media control token: %v", err)
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		if token.Header["typ"] != "relayrtc-media-control+jwt" {
			t.Error("media control JWT profile is missing")
		}
		claims := token.Claims.(jwt.MapClaims)
		if claims["method"] != request.Method || claims["path"] != request.URL.EscapedPath() {
			t.Error("grant is not bound to the cleanup request")
		}
		authority := claims["authority"].(map[string]any)
		if authority["kind"] != "participant-cleanup" || authority["roomId"] != "room_1" || authority["participantId"] != "participant_1" {
			t.Errorf("incorrect cleanup authority: %v", authority)
		}
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := newParticipantMediaClient(server.URL+"/internal/v1", secret)
	if err := client.RemoveParticipant(context.Background(), "room_1", "participant_1"); err != nil {
		t.Fatal(err)
	}
}

func TestParticipantMediaClientRejectsShortSecret(t *testing.T) {
	client := newParticipantMediaClient("http://127.0.0.1:1/internal/v1", "short")
	if err := client.RemoveParticipant(context.Background(), "room_1", "participant_1"); err == nil {
		t.Fatal("cleanup accepted an invalid service secret")
	}
}

func TestParticipantMediaClientPropagatesRejectedCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	client := newParticipantMediaClient(server.URL+"/internal/v1", "test-media-control-secret-at-least-32-characters")
	if err := client.RemoveParticipant(context.Background(), "room_1", "participant_1"); err == nil {
		t.Fatal("cleanup ignored the media authentication failure")
	}
}
