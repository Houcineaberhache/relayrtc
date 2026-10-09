package session

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"
)

func TestUsageSamplesAgainstPostgres(t *testing.T) {
	databaseURL := os.Getenv("RELAYRTC_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("dedicated PostgreSQL test database not configured")
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.Path != "/relayrtc_usage_test" {
		t.Fatal("dedicated relayrtc_usage_test database required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal("could not open test database")
	}
	defer pool.Close()
	_, err = pool.Exec(ctx, `
 INSERT INTO organization (id, name, slug) VALUES ('org_go_xp6', 'Go usage', 'go-usage-xp6');
 INSERT INTO project (id, organization_id, name, slug) VALUES ('project_go_xp6', 'org_go_xp6', 'Go', 'go');
 INSERT INTO environment (id, project_id, name, slug, type) VALUES ('env_go_xp6', 'project_go_xp6', 'Go', 'go', 'custom');
 INSERT INTO room (id, project_id, environment_id, name, max_participants) VALUES ('room_go_xp6', 'project_go_xp6', 'env_go_xp6', 'Go', 100);
 INSERT INTO participant (id, room_id, name) VALUES ('participant_go_xp6', 'room_go_xp6', 'Go');
 INSERT INTO participant_session (id, participant_id, signaling_node_id) VALUES ('session_go_xp6', 'participant_go_xp6', 'go');`)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM organization WHERE id = 'org_go_xp6'`); err != nil {
			t.Error(err)
		}
	}()
	store := NewStore(pool, time.Hour)
	for _, sample := range []struct {
		id                 string
		incoming, outgoing int64
	}{{"go_sample_1", 3, 4}, {"go_sample_1", 3, 4}, {"go_sample_2", 2, 3}} {
		if err := store.RecordUsageSample(ctx, "session_go_xp6", sample.id, sample.incoming, sample.outgoing); err != nil {
			t.Fatal(err)
		}
	}
	var wg sync.WaitGroup
	for attempt := 0; attempt < 10; attempt++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := store.RecordUsageSample(ctx, "session_go_xp6", "go_sample_concurrent", 1, 1); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	var incoming, outgoing int64
	if err := pool.QueryRow(ctx, `SELECT messages_in, messages_out FROM participant_session WHERE id = 'session_go_xp6'`).Scan(&incoming, &outgoing); err != nil {
		t.Fatal(err)
	}
	if incoming != 6 || outgoing != 8 {
		t.Fatalf("duplicate usage persisted: %d/%d", incoming, outgoing)
	}
	var eventsIn, eventsOut float64
	if err := pool.QueryRow(ctx, `SELECT coalesce(sum(value) FILTER (WHERE metric = 'messagesIn'), 0), coalesce(sum(value) FILTER (WHERE metric = 'messagesOut'), 0) FROM usage_event WHERE organization_id = 'org_go_xp6'`).Scan(&eventsIn, &eventsOut); err != nil {
		t.Fatal(err)
	}
	if eventsIn != 6 || eventsOut != 8 {
		t.Fatalf("duplicate report events persisted: %f/%f", eventsIn, eventsOut)
	}
	if err := store.RecordUsageSample(ctx, "missing_session", "go_missing", 1, 1); err == nil {
		t.Fatal("missing session accepted")
	}
}
