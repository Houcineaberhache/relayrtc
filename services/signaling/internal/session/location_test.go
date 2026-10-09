package session

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type locationPool struct {
	storePool
	query string
	args  []any
}

func (pool *locationPool) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	pool.query = query
	pool.args = args
	return pgconn.NewCommandTag("UPDATE 1"), nil
}

func TestLocationRetentionClearsOnlyPersonalFields(t *testing.T) {
	pool := &locationPool{}
	store := &Store{pool: pool, locationRetention: 168 * time.Hour}
	cutoff := time.Now().Add(-168 * time.Hour)
	if err := store.PurgeLocations(context.Background(), cutoff, true); err != nil {
		t.Fatal(err)
	}
	if pool.args[0] != cutoff || pool.args[1] != true {
		t.Fatal("incorrect retention parameters")
	}
	for _, required := range []string{"client_ip", "country_code", "country", "joined_at < $1", "$2 AND client_ip IS NOT NULL"} {
		if !strings.Contains(pool.query, required) {
			t.Fatalf("cleanup missing %s", required)
		}
	}
	for _, metric := range []string{"messages_in =", "messages_out =", "connection_seconds =", "DELETE"} {
		if strings.Contains(pool.query, metric) {
			t.Fatal("retention removed session usage or history")
		}
	}
}

func TestLocationWriteDoesNotRestoreExpiredData(t *testing.T) {
	pool := &locationPool{}
	store := &Store{pool: pool, locationRetention: 168 * time.Hour}
	before := time.Now().Add(-168 * time.Hour)
	if err := store.SetLocation(context.Background(), "session_1", "", "MA", "Morocco"); err != nil {
		t.Fatal(err)
	}
	cutoff, ok := pool.args[4].(time.Time)
	if !ok || cutoff.Before(before) || cutoff.After(time.Now().Add(-168*time.Hour)) {
		t.Fatal("incorrect collection cutoff")
	}
	if !strings.Contains(pool.query, "joined_at >= $5") || !strings.Contains(pool.query, "NULLIF($2, '')") {
		t.Fatal("write did not enforce data minimization and expiry")
	}
}
