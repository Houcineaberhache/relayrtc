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
	ErrSessionNotResumable = errors.New("session is not resumable")
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

type ResumeResult struct {
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

func (store *Store) RecordUsage(ctx context.Context, sessionID string, messagesIn, messagesOut int64) error {
	_, err := store.pool.Exec(ctx, `
		UPDATE participant_session
		SET messages_in = messages_in + $2, messages_out = messages_out + $3
		WHERE id = $1`, sessionID, messagesIn, messagesOut)
	if err != nil {
		return fmt.Errorf("record signaling usage: %w", err)
	}
	return nil
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
	return store.finalize(ctx, roomID, participantID, sessionID, false)
}

func (store *Store) Disconnect(ctx context.Context, participantID, sessionID string) (time.Time, error) {
	disconnectedAt := time.Now().UTC()
	command, err := store.pool.Exec(ctx, `
		UPDATE participant_session
		SET connection_state = 'reconnecting', disconnected_at = $1,
		    connection_seconds = connection_seconds + extract(epoch from ($1 - coalesce(reconnected_at, joined_at)))
		WHERE id = $2 AND participant_id = $3 AND connection_state = 'connected'`,
		disconnectedAt, sessionID, participantID,
	)
	if err != nil {
		return time.Time{}, fmt.Errorf("mark participant session reconnecting: %w", err)
	}
	if command.RowsAffected() == 0 {
		return time.Time{}, ErrSessionNotResumable
	}
	return disconnectedAt, nil
}

func (store *Store) Resume(
	ctx context.Context,
	claims auth.Claims,
	sessionID, nodeID string,
	notDisconnectedBefore time.Time,
) (ResumeResult, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ResumeResult{}, fmt.Errorf("begin resume transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	participant := Participant{}
	session := ParticipantSession{}
	err = tx.QueryRow(ctx, `
		SELECT p.id, p.room_id, p.external_id, p.name, p.metadata, p.role, p.joined_at, p.left_at,
		       s.id, s.participant_id, s.signaling_node_id, s.media_node_id, s.connection_state,
		       s.transport_type, s.joined_at, s.disconnected_at, s.reconnected_at
		FROM participant_session s
		JOIN participant p ON p.id = s.participant_id
		JOIN room r ON r.id = p.room_id
		WHERE s.id = $1 AND s.participant_id = $2 AND p.room_id = $3
		  AND r.project_id = $4 AND r.environment_id = $5
		  AND p.left_at IS NULL AND s.connection_state = 'reconnecting'
		  AND s.disconnected_at >= $6
		FOR UPDATE`,
		sessionID, claims.ParticipantID, claims.RoomID, claims.ProjectID, claims.EnvironmentID,
		notDisconnectedBefore,
	).Scan(
		&participant.ID, &participant.RoomID, &participant.ExternalID, &participant.Name,
		&participant.Metadata, &participant.Role, &participant.JoinedAt, &participant.LeftAt,
		&session.ID, &session.ParticipantID, &session.SignalingNodeID, &session.MediaNodeID,
		&session.ConnectionState, &session.TransportType, &session.JoinedAt,
		&session.DisconnectedAt, &session.ReconnectedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ResumeResult{}, ErrSessionNotResumable
		}
		return ResumeResult{}, fmt.Errorf("select resumable participant session: %w", err)
	}

	reconnectedAt := time.Now().UTC()
	err = tx.QueryRow(ctx, `
		UPDATE participant_session
		SET connection_state = 'connected', signaling_node_id = $1, reconnected_at = $2,
		    disconnected_at = NULL
		WHERE id = $3 AND connection_state = 'reconnecting'
		RETURNING id, participant_id, signaling_node_id, media_node_id, connection_state,
		          transport_type, joined_at, disconnected_at, reconnected_at`,
		nodeID, reconnectedAt, sessionID,
	).Scan(
		&session.ID, &session.ParticipantID, &session.SignalingNodeID, &session.MediaNodeID,
		&session.ConnectionState, &session.TransportType, &session.JoinedAt,
		&session.DisconnectedAt, &session.ReconnectedAt,
	)
	if err != nil {
		return ResumeResult{}, ErrSessionNotResumable
	}
	participants, err := listParticipants(ctx, tx, claims.RoomID)
	if err != nil {
		return ResumeResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ResumeResult{}, fmt.Errorf("commit session resume: %w", err)
	}
	return ResumeResult{Participant: participant, Session: session, Participants: participants}, nil
}

func (store *Store) Expire(ctx context.Context, roomID, participantID, sessionID string) (time.Time, error) {
	return store.finalize(ctx, roomID, participantID, sessionID, true)
}

func (store *Store) EndRoom(ctx context.Context, roomID string, endedAt time.Time) error {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin room termination transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE participant_session s
		SET connection_seconds = connection_seconds + case when connection_state = 'connected'
		      then extract(epoch from ($1 - coalesce(reconnected_at, joined_at))) else 0 end,
		    connection_state = 'disconnected', disconnected_at = COALESCE(disconnected_at, $1)
		FROM participant p
		WHERE s.participant_id = p.id AND p.room_id = $2
		  AND s.connection_state IN ('connected', 'reconnecting')`, endedAt, roomID); err != nil {
		return fmt.Errorf("disconnect ended room sessions: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE participant SET left_at = COALESCE(left_at, $1)
		WHERE room_id = $2 AND left_at IS NULL`, endedAt, roomID); err != nil {
		return fmt.Errorf("leave ended room participants: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit room termination: %w", err)
	}
	return nil
}

func (store *Store) UpdateMetadata(
	ctx context.Context,
	roomID, participantID, sessionID string,
	metadata json.RawMessage,
) (Participant, error) {
	participant := Participant{}
	err := store.pool.QueryRow(ctx, `
		UPDATE participant p
		SET metadata = $1
		FROM participant_session s
		WHERE p.id = $2 AND p.room_id = $3 AND p.left_at IS NULL
		  AND s.id = $4 AND s.participant_id = p.id AND s.connection_state = 'connected'
		RETURNING p.id, p.room_id, p.external_id, p.name, p.metadata, p.role,
		          p.joined_at, p.left_at`,
		metadata, participantID, roomID, sessionID,
	).Scan(
		&participant.ID, &participant.RoomID, &participant.ExternalID, &participant.Name,
		&participant.Metadata, &participant.Role, &participant.JoinedAt, &participant.LeftAt,
	)
	if err != nil {
		return Participant{}, fmt.Errorf("update participant metadata: %w", err)
	}
	return participant, nil
}

func (store *Store) finalize(
	ctx context.Context,
	roomID, participantID, sessionID string,
	reconnectingOnly bool,
) (time.Time, error) {
	tx, err := store.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return time.Time{}, fmt.Errorf("begin leave transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	leftAt := time.Now().UTC()
	query := `
		UPDATE participant_session
		SET connection_seconds = connection_seconds + case when connection_state = 'connected'
		      then extract(epoch from ($1 - coalesce(reconnected_at, joined_at))) else 0 end,
		    connection_state = 'disconnected', disconnected_at = COALESCE(disconnected_at, $1)
		WHERE id = $2 AND participant_id = $3`
	if reconnectingOnly {
		query += ` AND connection_state = 'reconnecting'`
	}
	command, err := tx.Exec(ctx, query, leftAt, sessionID, participantID)
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
