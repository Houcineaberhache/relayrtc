package connection

import (
	"context"
	"errors"
	"time"

	"github.com/gorilla/websocket"
)

func (handler *Handler) RemoveParticipantSession(ctx context.Context, roomID, participantID, sessionID string) error {
	handler.cancelRecovery(sessionID)
	handler.registry.mu.RLock()
	owner := handler.registry.sessions[sessionID]
	handler.registry.mu.RUnlock()
	if owner != nil {
		owner.mu.Lock()
		owner.revoked = true
		owner.rtcReady = false
		owner.mu.Unlock()
		handler.registry.leave(roomID, owner)
		owner.close(4004, "participant removed")
		_ = owner.connection.Close()
		owner.operationMu.Lock()
		defer owner.operationMu.Unlock()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if _, ok := handler.rtcService.(RTCSessionLifecycle); !ok {
		return errors.New("participant runtime cleanup unavailable")
	}
	if err := handler.removeSessionMedia(ctx, roomID, participantID, sessionID); err != nil {
		return err
	}
	handler.registry.broadcast(roomID, owner, event("participant.left", map[string]any{
		"roomId": roomID, "participantId": participantID, "sessionId": sessionID, "leftAt": time.Now().UTC(),
	}))
	return nil
}

func (handler *Handler) sessionActive(ctx context.Context, roomID, participantID, sessionID string) bool {
	verifier, ok := handler.sessionStore.(interface {
		IsActive(context.Context, string, string, string) (bool, error)
	})
	if !ok {
		return true
	}
	active, err := verifier.IsActive(ctx, roomID, participantID, sessionID)
	return err == nil && active
}

func (client *client) isRevoked() bool {
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.revoked
}

func (client *client) rejectRevoked() {
	client.close(websocket.ClosePolicyViolation, "participant session unavailable")
	_ = client.connection.Close()
}
