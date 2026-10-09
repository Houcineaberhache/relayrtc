package connection

import (
	"context"
	"errors"
	"testing"
)

type meteringSessionStore struct {
	*fakeSessionStore
	fail                bool
	incoming            int64
	outgoing            int64
	calls               int
	samples             map[string]bool
	acknowledgementLost bool
}

func (store *meteringSessionStore) RecordUsageSample(_ context.Context, _ string, sampleID string, incoming, outgoing int64) error {
	store.calls++
	if store.fail {
		return errors.New("database unavailable")
	}
	if store.samples == nil {
		store.samples = make(map[string]bool)
	}
	if store.samples[sampleID] {
		return nil
	}
	store.samples[sampleID] = true
	store.incoming += incoming
	store.outgoing += outgoing
	if store.acknowledgementLost {
		store.acknowledgementLost = false
		return errors.New("commit acknowledgement lost")
	}
	return nil
}

func TestUsageRetriesFailedWritesWithoutRepeatingSuccessfulDeltas(t *testing.T) {
	store := &meteringSessionStore{fakeSessionStore: &fakeSessionStore{}, fail: true}
	handler := &Handler{sessionStore: store}
	connection := &client{messagesIn: 5, messagesOut: 7}
	handler.flushClientUsage(connection, "session")
	connection.recordMessageReceived()
	store.fail = false
	handler.flushClientUsage(connection, "session")
	handler.flushClientUsage(connection, "session")
	if store.incoming != 6 || store.outgoing != 7 || store.calls != 3 {
		t.Fatalf("unexpected persisted usage: incoming=%d outgoing=%d calls=%d", store.incoming, store.outgoing, store.calls)
	}
}

func TestUsageRetriesCommitAcknowledgementWithTheSameSample(t *testing.T) {
	store := &meteringSessionStore{fakeSessionStore: &fakeSessionStore{}, acknowledgementLost: true}
	handler := &Handler{sessionStore: store}
	connection := &client{messagesIn: 5, messagesOut: 7}
	handler.flushClientUsage(connection, "session")
	connection.recordMessageReceived()
	handler.flushClientUsage(connection, "session")
	if store.incoming != 6 || store.outgoing != 7 || store.calls != 3 {
		t.Fatalf("unexpected persisted usage: incoming=%d outgoing=%d calls=%d", store.incoming, store.outgoing, store.calls)
	}
}
