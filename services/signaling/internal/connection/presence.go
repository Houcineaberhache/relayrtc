package connection

import (
	"context"
	"encoding/json"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

type metadataUpdatePayload struct {
	RoomID        string         `json:"roomId"`
	ParticipantID string         `json:"participantId"`
	SessionID     string         `json:"sessionId"`
	Metadata      map[string]any `json:"metadata"`
}

func (handler *Handler) handleMetadataUpdate(
	client *client,
	claims auth.Claims,
	joined *joinedSession,
	request requestEnvelope,
) {
	if joined == nil {
		client.protocolError(request.ID, "forbidden", "Join the room before updating presence")
		return
	}
	if !hasPermission(claims.Permissions, "metadata:update") {
		client.protocolError(request.ID, "forbidden", "The participant cannot update metadata")
		return
	}
	payload := metadataUpdatePayload{}
	if json.Unmarshal(request.Payload, &payload) != nil || payload.Metadata == nil ||
		payload.RoomID != claims.RoomID || payload.ParticipantID != claims.ParticipantID ||
		payload.SessionID != joined.session.ID {
		client.protocolError(request.ID, "forbidden", "The metadata update does not match this session")
		return
	}
	metadata, err := json.Marshal(payload.Metadata)
	if err != nil {
		client.protocolError(request.ID, "invalid_message", "The participant metadata is invalid")
		return
	}
	operationContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	participant, err := handler.sessionStore.UpdateMetadata(
		operationContext, claims.RoomID, claims.ParticipantID, joined.session.ID, metadata,
	)
	cancel()
	if err != nil {
		client.protocolError(request.ID, "internal_error", "The participant metadata could not be updated")
		return
	}
	joined.participant = participant
	delivered := map[string]any{"participant": participant}
	client.response(request.ID, "participant.metadata.update.accepted", delivered)
	handler.registry.broadcast(
		claims.RoomID, client, event("participant.metadata.updated", delivered),
	)
}
