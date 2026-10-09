package rtc

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func runtimeDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("RELAYRTC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("dedicated PostgreSQL test database not configured")
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.Path != "/relayrtc_usage_test" {
		t.Fatal("dedicated relayrtc_usage_test database required")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	_, err = pool.Exec(context.Background(), `
 INSERT INTO organization (id, name, slug) VALUES ('org_runtime_test', 'Runtime', 'runtime-test');
 INSERT INTO project (id, organization_id, name, slug) VALUES ('project_a', 'org_runtime_test', 'Runtime', 'runtime');
 INSERT INTO environment (id, project_id, name, slug, type) VALUES ('env_a', 'project_a', 'Runtime', 'runtime', 'custom');
 INSERT INTO room (id, project_id, environment_id, name, max_participants, status) VALUES ('room_a', 'project_a', 'env_a', 'Runtime', 10, 'active');
 INSERT INTO participant (id, room_id, name) VALUES ('participant_a', 'room_a', 'A'), ('participant_b', 'room_a', 'B');
 INSERT INTO participant_session (id, participant_id, signaling_node_id) VALUES ('session_a', 'participant_a', 'signaling-test'), ('session_b', 'participant_b', 'signaling-test');`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := pool.Exec(context.Background(), `DELETE FROM organization WHERE id = 'org_runtime_test';
 DELETE FROM usage_history_interval WHERE session_id IN ('session_a', 'session_b');
 DELETE FROM usage_history_session WHERE room_id = 'room_a';
 DELETE FROM usage_history_room WHERE organization_id = 'org_runtime_test';
 DELETE FROM usage_event WHERE organization_id = 'org_runtime_test';
 DELETE FROM usage_aggregate WHERE organization_id = 'org_runtime_test';
 DELETE FROM usage_history_environment WHERE project_id = 'project_a';
 DELETE FROM usage_history_project WHERE organization_id = 'org_runtime_test';
 DELETE FROM usage_history_organization WHERE id = 'org_runtime_test';`)
		if err != nil {
			t.Error(err)
		}
	})
	return pool
}

func TestPostgresAdapterDurableReceiptsAndCleanup(t *testing.T) {
	pool := runtimeDatabase(t)
	media := &testMedia{calls: map[string]int{}, nodeID: "media-local"}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { media.serve(t, w, r) }))
	defer server.Close()
	httpMedia, _ := NewMediaHTTP(server.URL+"/internal/v1", adapterSecret)
	defer httpMedia.Close()
	store := NewPostgresStore(pool, "signaling-test")
	adapter, _ := NewAdapter(store, httpMedia, "media-local")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	request := adapterRequest("durable", "rtc.transport.create", "session_a", map[string]any{"direction": "send"})
	first, err := adapter.Handle(ctx, adapterClaims("participant_a"), "session_a", request)
	if err != nil {
		t.Fatal(err)
	}
	reconstructed, _ := NewAdapter(NewPostgresStore(pool, "signaling-test"), httpMedia, "media-local")
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			replay, err := reconstructed.Handle(ctx, adapterClaims("participant_a"), "session_a", request)
			if err != nil || !reflect.DeepEqual(replay, first) {
				t.Error("durable replay failed", err)
			}
		}()
	}
	wg.Wait()
	if media.calls["POST /internal/v1/rooms/room_a/transports"] != 1 {
		t.Fatal("persistent lock did not prevent duplicate allocation")
	}
	var nodeID string
	if err := pool.QueryRow(ctx, `SELECT media_node_id FROM participant_session WHERE id = 'session_a'`).Scan(&nodeID); err != nil || nodeID != "media-local" {
		t.Fatal("session placement was not persisted")
	}
	wrongNode, _ := NewAdapter(NewPostgresStore(pool, "other-signaling"), httpMedia, "media-local")
	if _, err := wrongNode.Handle(ctx, adapterClaims("participant_a"), "session_a", request); !errors.Is(err, ErrForbidden) {
		t.Fatal("another signaling node claimed the session")
	}
	if err := store.WithRoom(ctx, "room_a", func(room LockedRoom) error {
		_, state, err := room.Load(ctx)
		if err != nil {
			return err
		}
		state.Sessions["session_a"].Pending = true
		state.Sessions["session_a"].Receipts["crashed"] = Receipt{Failed: true}
		return room.Save(ctx, state)
	}); err != nil {
		t.Fatal(err)
	}
	if err := reconstructed.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := reconstructed.Handle(ctx, adapterClaims("participant_a"), "session_a", request); !errors.Is(err, ErrUnavailable) {
		t.Fatal("crash recovery replayed a stale transport")
	}
	if _, err := pool.Exec(ctx, `UPDATE room SET status = 'ended', ended_at = now() WHERE id = 'room_a'`); err != nil {
		t.Fatal(err)
	}
	if err := reconstructed.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if media.room {
		t.Fatal("ended room survived reconciliation")
	}
}

func TestRealMediaAdapterSmoke(t *testing.T) {
	endpoint := os.Getenv("RELAYRTC_TEST_MEDIA_URL")
	if endpoint == "" {
		t.Skip("dedicated real media runtime not configured")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Path != "/internal/v1" {
		t.Fatal("dedicated loopback media runtime required")
	}
	pool := runtimeDatabase(t)
	media, err := NewMediaHTTP(endpoint, adapterSecret)
	if err != nil {
		t.Fatal(err)
	}
	defer media.Close()
	adapter, _ := NewAdapter(NewPostgresStore(pool, "signaling-test"), media, "media-local")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := adapter.CloseRoom(cleanup, "room_a"); err != nil {
			t.Error(err)
		}
	})
	caps, err := adapter.Handle(ctx, adapterClaims("participant_a"), "session_a", adapterRequest("capabilities", "rtc.capabilities.get", "session_a", nil))
	if err != nil {
		t.Fatal(err)
	}
	if codecs, ok := caps.Payload["routerCapabilities"].(map[string]any)["codecs"].([]any); !ok || len(codecs) == 0 {
		t.Fatal("real router did not expose codecs")
	}
	created, err := adapter.Handle(ctx, adapterClaims("participant_a"), "session_a", adapterRequest("transport", "rtc.transport.create", "session_a", map[string]any{"direction": "send"}))
	if err != nil {
		t.Fatal(err)
	}
	transportID := created.Payload["transportId"]
	ice, err := adapter.Handle(ctx, adapterClaims("participant_a"), "session_a", adapterRequest("restart", "rtc.ice.restart", "session_a", map[string]any{"transportId": transportID}))
	if err != nil {
		t.Fatal(err)
	}
	firstICE, _ := json.Marshal(created.Payload["iceParameters"])
	secondICE, _ := json.Marshal(ice.Payload["iceParameters"])
	if string(firstICE) == string(secondICE) {
		t.Fatal("real ICE restart did not rotate credentials")
	}
	if _, err := adapter.Handle(ctx, adapterClaims("participant_b"), "session_b", adapterRequest("steal", "rtc.ice.restart", "session_b", map[string]any{"transportId": transportID})); !errors.Is(err, ErrForbidden) {
		t.Fatal("real transport ownership boundary failed")
	}
	if err := adapter.RemoveSession(ctx, "room_a", "participant_a", "session_a"); err != nil {
		t.Fatal(err)
	}
	if _, err := adapter.Handle(ctx, adapterClaims("participant_a"), "session_a", adapterRequest("removed", "rtc.ice.restart", "session_a", map[string]any{"transportId": transportID})); !errors.Is(err, ErrForbidden) {
		t.Fatal("removed transport remained bound")
	}
}
