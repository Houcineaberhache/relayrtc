package rtc

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

type PostgresStore struct {
	pool            *pgxpool.Pool
	signalingNodeID string
}

func NewPostgresStore(pool *pgxpool.Pool, signalingNodeID string) *PostgresStore {
	return &PostgresStore{pool: pool, signalingNodeID: signalingNodeID}
}

func (store *PostgresStore) ReconciliationRooms(ctx context.Context, nodeID string) ([]string, error) {
	rows, err := store.pool.Query(ctx, `SELECT m.room_id FROM rtc_runtime m JOIN room r ON r.id = m.room_id
 WHERE m.state->>'MediaNodeID' = $1 AND (
 ((r.status NOT IN ('created', 'active') OR coalesce((m.state->>'Closing')::boolean, false)) AND coalesce(m.state->>'Generation', '') <> '')
 OR coalesce((m.state->>'Allocating')::boolean, false)
 OR EXISTS (SELECT 1 FROM jsonb_each(m.state->'Sessions') s WHERE (s.value->>'Pending')::boolean))
 ORDER BY m.updated_at LIMIT 50`, nodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roomIDs []string
	for rows.Next() {
		var roomID string
		if err := rows.Scan(&roomID); err != nil {
			return nil, err
		}
		roomIDs = append(roomIDs, roomID)
	}
	return roomIDs, rows.Err()
}

func (room *postgresRoom) Ended(ctx context.Context) (bool, error) {
	var ended bool
	err := room.connection.QueryRow(ctx, `SELECT status NOT IN ('created', 'active') OR ended_at IS NOT NULL FROM room WHERE id = $1`, room.roomID).Scan(&ended)
	return ended, err
}

type postgresRoom struct {
	connection *pgxpool.Conn
	roomID     string
	nodeID     string
}

func (store *PostgresStore) WithRoom(ctx context.Context, roomID string, action func(LockedRoom) error) error {
	connection, err := store.pool.Acquire(ctx)
	if err != nil {
		return ErrUnavailable
	}
	defer connection.Release()
	if _, err := connection.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended($1, 732))`, roomID); err != nil {
		_ = connection.Conn().Close(context.Background())
		return ErrUnavailable
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if _, err := connection.Exec(cleanup, `SELECT pg_advisory_unlock(hashtextextended($1, 732))`, roomID); err != nil {
			_ = connection.Conn().Close(cleanup)
		}
	}()
	return action(&postgresRoom{connection: connection, roomID: roomID, nodeID: store.signalingNodeID})
}

func (room *postgresRoom) Load(ctx context.Context) (Scope, *RoomState, error) {
	scope := Scope{RoomID: room.roomID}
	var encoded []byte
	err := room.connection.QueryRow(ctx, `SELECT r.project_id, r.environment_id, m.state FROM room r LEFT JOIN rtc_runtime m ON m.room_id = r.id WHERE r.id = $1`, room.roomID).Scan(&scope.ProjectID, &scope.EnvironmentID, &encoded)
	if errors.Is(err, pgx.ErrNoRows) {
		return Scope{}, nil, ErrForbidden
	}
	if err != nil {
		return Scope{}, nil, ErrUnavailable
	}
	state := &RoomState{Sessions: map[string]*SessionState{}}
	if len(encoded) != 0 && json.Unmarshal(encoded, state) != nil {
		return Scope{}, nil, ErrUnavailable
	}
	return scope, state, nil
}

func (room *postgresRoom) Joined(ctx context.Context, claims auth.Claims, sessionID string) error {
	var joined bool
	err := room.connection.QueryRow(ctx, `SELECT EXISTS (
 SELECT 1 FROM participant_session s JOIN participant p ON p.id = s.participant_id JOIN room r ON r.id = p.room_id
 WHERE s.id = $1 AND p.id = $2 AND r.id = $3 AND r.project_id = $4 AND r.environment_id = $5
 AND s.signaling_node_id = $6 AND s.connection_state = 'connected' AND p.left_at IS NULL
 AND r.status IN ('created', 'active') AND r.ended_at IS NULL
)`, sessionID, claims.ParticipantID, room.roomID, claims.ProjectID, claims.EnvironmentID, room.nodeID).Scan(&joined)
	if err != nil {
		return ErrUnavailable
	}
	if !joined {
		return ErrForbidden
	}
	return nil
}

func (room *postgresRoom) Save(ctx context.Context, state *RoomState) error {
	encoded, err := json.Marshal(state)
	if err != nil || len(encoded) > 8_388_608 {
		return ErrUnavailable
	}
	_, err = room.connection.Exec(ctx, `INSERT INTO rtc_runtime (room_id, state) VALUES ($1, $2::jsonb)
 ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`, room.roomID, string(encoded))
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

func (room *postgresRoom) Assign(ctx context.Context, sessionID, nodeID string) error {
	_, err := room.connection.Exec(ctx, `UPDATE participant_session SET media_node_id = $2 WHERE id = $1`, sessionID, nodeID)
	if err != nil {
		return ErrUnavailable
	}
	return nil
}
