package session

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

type admissionPool struct {
	storePool
	tx *admissionTx
}

func (pool admissionPool) BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error) {
	return pool.tx, nil
}

type admissionRow struct{ scan func(...any) error }

func (row admissionRow) Scan(dest ...any) error { return row.scan(dest...) }

type admissionTx struct {
	pgx.Tx
	status     string
	projectErr error
	queries    []string
	rollback   bool
}

func (tx *admissionTx) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	tx.queries = append(tx.queries, sql)
	return admissionRow{scan: func(dest ...any) error {
		if strings.Contains(sql, "FROM project") {
			if tx.projectErr != nil {
				return tx.projectErr
			}
			*dest[0].(*string) = tx.status
			return nil
		}
		return pgx.ErrNoRows
	}}
}

func (tx *admissionTx) Rollback(context.Context) error { tx.rollback = true; return nil }

func TestProjectAdmissionBeforeJoinAndResume(t *testing.T) {
	for _, status := range []string{"active", "suspended", "deleting", "deleted", "missing"} {
		for _, operation := range []string{"join", "resume"} {
			t.Run(operation+"/"+status, func(t *testing.T) {
				tx := &admissionTx{status: status}
				if status == "missing" {
					tx.projectErr = pgx.ErrNoRows
				}
				store := &Store{pool: admissionPool{tx: tx}}
				claims := auth.Claims{ProjectID: "project_1", RoomID: "room_1", EnvironmentID: "env_1", ParticipantID: "participant_1"}
				var err error
				expected := ErrRoomNotJoinable
				if operation == "join" {
					_, err = store.Join(context.Background(), claims, "session_1", "node_1")
				} else {
					expected = ErrSessionNotResumable
					_, err = store.Resume(context.Background(), claims, "session_1", "node_1", time.Now())
				}
				if !errors.Is(err, expected) {
					t.Fatalf("unexpected admission result: %v", err)
				}
				if !tx.rollback {
					t.Fatal("transaction was not rolled back")
				}
				if len(tx.queries) == 0 || !strings.Contains(tx.queries[0], "FOR SHARE") {
					t.Fatal("project status was not locked before admission")
				}
				if status != "active" && len(tx.queries) != 1 {
					t.Fatal("inactive project reached room/session queries")
				}
				if status == "active" {
					if len(tx.queries) != 2 {
						t.Fatal("active project did not reach room/session lookup")
					}
					if operation == "resume" && !strings.Contains(tx.queries[1], "r.status IN ('created', 'active')") {
						t.Fatal("resume did not restrict room status")
					}
				}
			})
		}
	}
}

func TestProjectAdmissionFailsClosedOnDatabaseError(t *testing.T) {
	tx := &admissionTx{projectErr: errors.New("database unavailable")}
	store := &Store{pool: admissionPool{tx: tx}}
	_, err := store.Join(context.Background(), auth.Claims{ProjectID: "project_1"}, "session_1", "node_1")
	if err == nil || len(tx.queries) != 1 || !tx.rollback {
		t.Fatal("database error did not deny admission and roll back")
	}
}
