package app

import (
	"context"
	"errors"
	"testing"
	"time"
)

type retentionCall struct {
	cutoff  time.Time
	clearIP bool
}
type retentionRecorder struct{ calls chan retentionCall }

func (store retentionRecorder) PurgeLocations(_ context.Context, cutoff time.Time, clearIP bool) error {
	store.calls <- retentionCall{cutoff, clearIP}
	return errors.New("transient database error")
}

func TestLocationRetentionRetriesAndStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := retentionRecorder{calls: make(chan retentionCall, 10)}
	retention := 168 * time.Hour
	started := time.Now()
	done := runLocationRetention(ctx, store, retention, true, 10*time.Millisecond)
	for index := 0; index < 2; index++ {
		select {
		case call := <-store.calls:
			if !call.clearIP || call.cutoff.Before(started.Add(-retention)) || call.cutoff.After(time.Now().Add(-retention)) {
				t.Fatal("incorrect privacy cleanup policy")
			}
		case <-time.After(time.Second):
			t.Fatal("cleanup did not retry")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cleanup did not stop")
	}
}
