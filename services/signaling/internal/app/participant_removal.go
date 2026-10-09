package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
	"github.com/relayrtc/relayrtc/services/signaling/internal/rtc"
	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

type participantRemoval struct {
	operationID   string
	sessionID     string
	participantID string
	roomID        string
	kind          string
	payload       []byte
}

func processParticipantRemovals(ctx context.Context, pool *pgxpool.Pool, connections *connection.Handler, nodeID, participantID, instanceID string) error {
	rows, err := pool.Query(ctx, `SELECT t.operation_id, t.session_id, t.participant_id, t.room_id, o.kind, o.payload
 FROM participant_removal_target t JOIN runtime_operation o ON o.id = t.operation_id
 WHERE t.status <> 'completed' AND EXISTS (SELECT 1 FROM signaling_node_lease WHERE node_id = $1 AND instance_id = $3 AND expires_at > now())
 AND t.available_at <= now() AND ($2 = '' OR (t.participant_id = $2 AND o.kind = 'participant.remove'))
 ORDER BY t.available_at LIMIT 8`, nodeID, participantID, instanceID)
	if err != nil {
		return err
	}
	var targets []participantRemoval
	for rows.Next() {
		var target participantRemoval
		if err := rows.Scan(&target.operationID, &target.sessionID, &target.participantID, &target.roomID, &target.kind, &target.payload); err != nil {
			rows.Close()
			return err
		}
		targets = append(targets, target)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	var failures []error
	for _, target := range targets {
		operation, cancel := context.WithTimeout(ctx, 10*time.Second)
		var err error
		if target.kind == "room.end" {
			var room session.Room
			err = json.Unmarshal(target.payload, &room)
			if err == nil {
				err = connections.EndRoom(operation, room)
			}
		} else {
			err = connections.RemoveParticipantSession(operation, target.roomID, target.participantID, target.sessionID)
		}
		cancel()
		if errors.Is(err, rtc.ErrForbidden) {
			var roomClosed bool
			if checkErr := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM runtime_operation
 WHERE id = $1 AND kind = 'room.end' AND status = 'completed')`, "room.end:"+target.roomID).Scan(&roomClosed); checkErr == nil && roomClosed {
				err = nil
			}
		}
		if err != nil {
			_, storeErr := pool.Exec(ctx, `UPDATE participant_removal_target SET status = 'failed', attempts = attempts + 1,
 available_at = now() + least(300, power(2, least(attempts + 1, 8))) * interval '1 second'
 WHERE operation_id = $1 AND session_id = $2 AND status <> 'completed'`, target.operationID, target.sessionID)
			failures = append(failures, errors.Join(err, storeErr))
			continue
		}
		_, err = pool.Exec(ctx, `UPDATE participant_removal_target SET status = 'completed', attempts = attempts + 1,
 completed_at = now() WHERE operation_id = $1 AND session_id = $2 AND status <> 'completed'`, target.operationID, target.sessionID)
		if err != nil {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func removeParticipant(pool *pgxpool.Pool, connections *connection.Handler, internalSecret, nodeID, instanceID string) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		provided := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
		if len(provided) != len(internalSecret) || subtle.ConstantTimeCompare([]byte(provided), []byte(internalSecret)) != 1 {
			http.Error(response, "unauthorized", http.StatusUnauthorized)
			return
		}
		participantID, roomID := request.PathValue("participantId"), request.PathValue("roomId")
		var removed bool
		err := pool.QueryRow(request.Context(), `SELECT EXISTS (SELECT 1 FROM participant
 WHERE id = $1 AND room_id = $2 AND removed_at IS NOT NULL)`, participantID, roomID).Scan(&removed)
		if err != nil {
			http.Error(response, "removal store unavailable", http.StatusServiceUnavailable)
			return
		}
		if !removed {
			http.Error(response, "removed participant not found", http.StatusNotFound)
			return
		}
		if err := processParticipantRemovals(request.Context(), pool, connections, nodeID, participantID, instanceID); err != nil {
			http.Error(response, "participant cleanup will retry", http.StatusServiceUnavailable)
			return
		}
		var pending bool
		err = pool.QueryRow(request.Context(), `SELECT EXISTS (SELECT 1 FROM participant_removal_target
 WHERE participant_id = $1 AND room_id = $2 AND status <> 'completed')`, participantID, roomID).Scan(&pending)
		if err != nil {
			http.Error(response, "removal store unavailable", http.StatusServiceUnavailable)
			return
		}
		if pending {
			response.WriteHeader(http.StatusAccepted)
			return
		}
		response.WriteHeader(http.StatusNoContent)
	}
}

func runParticipantRemoval(ctx context.Context, pool *pgxpool.Pool, connections *connection.Handler, nodeID, instanceID string) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			operation, cancel := context.WithTimeout(ctx, 20*time.Second)
			if err := processParticipantRemovals(operation, pool, connections, nodeID, "", instanceID); err != nil && ctx.Err() == nil {
				slog.Warn("participant removal will retry", "node_id", nodeID)
			}
			cancel()
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return done
}
