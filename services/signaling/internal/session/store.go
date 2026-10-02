package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

var (
	ErrParticipantConflict = errors.New("participant already joined")
	ErrRoomFull            = errors.New("room is full")
	ErrRoomNotJoinable     = errors.New("room is not joinable")
)

type Room struct {
	ID              string          `json:"id"`
	ProjectID       string          `json:"projectId"`
	EnvironmentID   string          `json:"environmentId"`
	Name            string          `json:"name"`
	Metadata        json.RawMessage `json:"metadata"`
	Status          string          `json:"status"`
	MaxParticipants int             `json:"maxParticipants"`
	CreatedAt       time.Time       `json:"createdAt"`
	StartedAt       *time.Time      `json:"startedAt"`
	EndedAt         *time.Time      `json:"endedAt"`
}

type Participant struct {
	ID         string          `json:"id"`
	RoomID     string          `json:"roomId"`
	ExternalID *string         `json:"externalId"`
	Name       string          `json:"name"`
	Metadata   json.RawMessage `json:"metadata"`
	Role       string          `json:"role"`
	JoinedAt   time.Time       `json:"joinedAt"`
	LeftAt     *time.Time      `json:"leftAt"`
}

type ParticipantSession struct {
	ID              string     `json:"id"`
	ParticipantID   string     `json:"participantId"`
	SignalingNodeID string     `json:"signalingNodeId"`
	MediaNodeID     *string    `json:"mediaNodeId"`
	ConnectionState string     `json:"connectionState"`
	TransportType   string     `json:"transportType"`
	JoinedAt        time.Time  `json:"joinedAt"`
	DisconnectedAt  *time.Time `json:"disconnectedAt"`
	ReconnectedAt   *time.Time `json:"reconnectedAt"`
}

type JoinResult struct {
	Room         Room
	Participant  Participant
	Session      ParticipantSession
	Participants []Participant
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (store *Store) Join(ctx context.Context, claims auth.Claims, sessionID, nodeID string) (JoinResult, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return JoinResult{}, fmt.Errorf("begin join transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	room, err := selectRoom(ctx, tx, claims.RoomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return JoinResult{}, ErrRoomNotJoinable
		}
		return JoinResult{}, err
	}
	if room.ProjectID != claims.ProjectID || room.EnvironmentID != claims.EnvironmentID ||
		(room.Status != "created" && room.Status != "active") {
		return JoinResult{}, ErrRoomNotJoinable
	}

	var active int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM participant WHERE room_id = $1 AND left_at IS NULL`, room.ID).Scan(&active); err != nil {
		return JoinResult{}, fmt.Errorf("count active participants: %w", err)
	}
	if active >= room.MaxParticipants {
		return JoinResult{}, ErrRoomFull
	}

	metadata, err := json.Marshal(claims.Metadata)
	if err != nil {
		return JoinResult{}, fmt.Errorf("encode participant metadata: %w", err)
	}
	participant := Participant{}
	err = tx.QueryRow(ctx, `
		INSERT INTO participant (id, room_id, name, metadata, role)
		VALUES ($1, $2, $3, $4, 'participant')
		RETURNING id, room_id, external_id, name, metadata, role, joined_at, left_at`,
		claims.ParticipantID, room.ID, claims.ParticipantName, metadata,
	).Scan(
		&participant.ID, &participant.RoomID, &participant.ExternalID, &participant.Name,
		&participant.Metadata, &participant.Role, &participant.JoinedAt, &participant.LeftAt,
	)
	if err != nil {
		if pgxErr := new(pgconn.PgError); errors.As(err, &pgxErr) && pgxErr.Code == "23505" {
			return JoinResult{}, ErrParticipantConflict
		}
		return JoinResult{}, fmt.Errorf("insert participant: %w", err)
	}

	participantSession := ParticipantSession{}
	err = tx.QueryRow(ctx, `
		INSERT INTO participant_session (id, participant_id, signaling_node_id)
		VALUES ($1, $2, $3)
		RETURNING id, participant_id, signaling_node_id, media_node_id, connection_state,
		          transport_type, joined_at, disconnected_at, reconnected_at`,
		sessionID, participant.ID, nodeID,
	).Scan(
		&participantSession.ID, &participantSession.ParticipantID, &participantSession.SignalingNodeID,
		&participantSession.MediaNodeID, &participantSession.ConnectionState,
		&participantSession.TransportType, &participantSession.JoinedAt,
		&participantSession.DisconnectedAt, &participantSession.ReconnectedAt,
	)
	if err != nil {
		return JoinResult{}, fmt.Errorf("insert participant session: %w", err)
	}

	if err := tx.QueryRow(ctx, `
		UPDATE room SET status = 'active', started_at = COALESCE(started_at, now())
		WHERE id = $1
		RETURNING status, started_at`, room.ID,
	).Scan(&room.Status, &room.StartedAt); err != nil {
		return JoinResult{}, fmt.Errorf("activate room: %w", err)
	}

	participants, err := listParticipants(ctx, tx, room.ID)
	if err != nil {
		return JoinResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return JoinResult{}, fmt.Errorf("commit join transaction: %w", err)
	}
	return JoinResult{Room: room, Participant: participant, Session: participantSession, Participants: participants}, nil
}

func (store *Store) Leave(ctx context.Context, roomID, participantID, sessionID string) (time.Time, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return time.Time{}, fmt.Errorf("begin leave transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	leftAt := time.Now().UTC()
	command, err := tx.Exec(ctx, `
		UPDATE participant_session
		SET connection_state = 'disconnected', disconnected_at = COALESCE(disconnected_at, $1)
		WHERE id = $2 AND participant_id = $3`, leftAt, sessionID, participantID)
	if err != nil {
		return time.Time{}, fmt.Errorf("disconnect participant session: %w", err)
	}
	if command.RowsAffected() == 0 {
		return time.Time{}, pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `
		UPDATE participant SET left_at = COALESCE(left_at, $1)
		WHERE id = $2 AND room_id = $3`, leftAt, participantID, roomID); err != nil {
		return time.Time{}, fmt.Errorf("leave participant: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return time.Time{}, fmt.Errorf("commit leave transaction: %w", err)
	}
	return leftAt, nil
}

func selectRoom(ctx context.Context, tx pgx.Tx, roomID string) (Room, error) {
	room := Room{}
	err := tx.QueryRow(ctx, `
		SELECT id, project_id, environment_id, name, metadata, status, max_participants,
		       created_at, started_at, ended_at
		FROM room WHERE id = $1 FOR UPDATE`, roomID,
	).Scan(
		&room.ID, &room.ProjectID, &room.EnvironmentID, &room.Name, &room.Metadata,
		&room.Status, &room.MaxParticipants, &room.CreatedAt, &room.StartedAt, &room.EndedAt,
	)
	return room, err
}

func listParticipants(ctx context.Context, tx pgx.Tx, roomID string) ([]Participant, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, room_id, external_id, name, metadata, role, joined_at, left_at
		FROM participant WHERE room_id = $1 AND left_at IS NULL ORDER BY joined_at, id`, roomID)
	if err != nil {
		return nil, fmt.Errorf("list room participants: %w", err)
	}
	defer rows.Close()
	participants := make([]Participant, 0)
	for rows.Next() {
		participant := Participant{}
		if err := rows.Scan(
			&participant.ID, &participant.RoomID, &participant.ExternalID, &participant.Name,
			&participant.Metadata, &participant.Role, &participant.JoinedAt, &participant.LeftAt,
		); err != nil {
			return nil, fmt.Errorf("scan room participant: %w", err)
		}
		participants = append(participants, participant)
	}
	return participants, rows.Err()
}
