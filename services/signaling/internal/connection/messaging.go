package connection

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

var customEventName = regexp.MustCompile(`^[a-z][a-z0-9_.-]{0,63}$`)

type messageScope struct {
	RoomID    string `json:"roomId"`
	SessionID string `json:"sessionId"`
}

type textMessagePayload struct {
	messageScope
	Text string `json:"text"`
}

type customEventPayload struct {
	messageScope
	Name string          `json:"name"`
	Data json.RawMessage `json:"data"`
}

func (handler *Handler) handleMessagingMessage(
	client *client,
	claims auth.Claims,
	joined *joinedSession,
	request requestEnvelope,
) {
	if joined == nil {
		client.protocolError(request.ID, "forbidden", "Join the room before sending messages")
		return
	}
	if !hasPermission(claims.Permissions, "messages:send") {
		client.protocolError(request.ID, "forbidden", "The participant cannot send messages")
		return
	}

	messageID := newID("message")
	switch request.Type {
	case "message.send":
		payload := textMessagePayload{}
		if json.Unmarshal(request.Payload, &payload) != nil ||
			!messageScopeMatches(payload.messageScope, claims.RoomID, joined.session.ID) ||
			strings.TrimSpace(payload.Text) == "" || utf8.RuneCountInString(payload.Text) > 4_000 {
			client.protocolError(request.ID, "invalid_message", "The text message payload is invalid")
			return
		}
		delivered := map[string]any{
			"messageId": messageID, "roomId": claims.RoomID,
			"participantId": claims.ParticipantID, "text": payload.Text,
		}
		client.response(request.ID, "message.sent", delivered)
		handler.registry.broadcast(claims.RoomID, client, event("message.received", delivered))
	case "event.emit":
		payload := customEventPayload{}
		if json.Unmarshal(request.Payload, &payload) != nil ||
			!messageScopeMatches(payload.messageScope, claims.RoomID, joined.session.ID) ||
			!customEventName.MatchString(payload.Name) || len(payload.Data) == 0 || !json.Valid(payload.Data) {
			client.protocolError(request.ID, "invalid_message", "The custom event payload is invalid")
			return
		}
		var data any
		if json.Unmarshal(payload.Data, &data) != nil {
			client.protocolError(request.ID, "invalid_message", "The custom event data is invalid")
			return
		}
		delivered := map[string]any{
			"messageId": messageID, "roomId": claims.RoomID,
			"participantId": claims.ParticipantID, "name": payload.Name, "data": data,
		}
		client.response(request.ID, "event.emitted", delivered)
		handler.registry.broadcast(claims.RoomID, client, event("event.received", delivered))
	}
}

func messageScopeMatches(scope messageScope, roomID, sessionID string) bool {
	return scope.RoomID == roomID && scope.SessionID == sessionID
}

func hasPermission(permissions []string, expected string) bool {
	for _, permission := range permissions {
		if permission == expected {
			return true
		}
	}
	return false
}
