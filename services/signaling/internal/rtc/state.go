package rtc

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

type Response struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type Receipt struct {
	Fingerprint string
	Response    *Response
	Failed      bool
}

type SessionState struct {
	ParticipantID string
	Ended         bool
	Pending       bool
	Transports    map[string]TransportBinding
	Tracks        map[string]TrackBinding
	Subscriptions map[string]SubscriptionBinding
	Receipts      map[string]Receipt
}

type RoomState struct {
	Sequence    uint64
	Events      []RuntimeEvent
	MediaNodeID string
	Generation  string
	Allocating  bool
	Ready       bool
	Closing     bool
	Sessions    map[string]*SessionState
}

type RuntimeEvent struct {
	Sequence  uint64
	ID        string
	SessionID string
	RequestID string
	Type      string
	Payload   map[string]any
	SentAt    time.Time
}

type LockedRoom interface {
	Load(context.Context) (Scope, *RoomState, error)
	Joined(context.Context, auth.Claims, string) error
	Save(context.Context, *RoomState) error
	Assign(context.Context, string, string) error
}

type RuntimeStore interface {
	WithRoom(context.Context, string, func(LockedRoom) error) error
}

func newID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(value[:])
}

func newSession(participantID string) *SessionState {
	return &SessionState{ParticipantID: participantID, Transports: map[string]TransportBinding{}, Tracks: map[string]TrackBinding{}, Subscriptions: map[string]SubscriptionBinding{}, Receipts: map[string]Receipt{}}
}
