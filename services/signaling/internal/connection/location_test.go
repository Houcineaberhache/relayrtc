package connection

import (
	"context"
	"testing"

	"github.com/relayrtc/relayrtc/services/signaling/internal/geolocation"
)

type locationRecord struct{ ip, code, country string }
type locationRecorder struct {
	SessionStore
	records chan locationRecord
}

func (store locationRecorder) SetLocation(_ context.Context, _, ip, code, country string) error {
	store.records <- locationRecord{ip, code, country}
	return nil
}

type countryLookup struct{ calls int }

func (lookup *countryLookup) Lookup(context.Context, string) (geolocation.Location, error) {
	lookup.calls++
	return geolocation.Location{CountryCode: "MA", Country: "Morocco"}, nil
}

func TestLocationCollectionPrivacy(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		for _, storeIP := range []bool{false, true} {
			store := locationRecorder{records: make(chan locationRecord, 1)}
			lookup := &countryLookup{}
			options := Options{SessionStore: store, StoreParticipantIP: storeIP}
			if enabled {
				options.LocationLookup = lookup
			}
			handler := NewHandler(options)
			handler.recordSessionLocation("session_1", "8.8.8.8")
			handler.wg.Wait()
			select {
			case record := <-store.records:
				if !enabled && !storeIP {
					t.Fatal("disabled collection persisted a location")
				}
				if !storeIP && record.ip != "" {
					t.Fatal("geolocation persisted raw IP without opt-in")
				}
				if storeIP && record.ip != "8.8.8.8" {
					t.Fatal("explicit IP storage did not persist IP")
				}
				if enabled && (record.code != "MA" || record.country != "Morocco") {
					t.Fatal("country analytics missing")
				}
			default:
				if enabled || storeIP {
					t.Fatal("enabled collection did not persist")
				}
			}
			if !enabled && lookup.calls != 0 {
				t.Fatal("disabled geolocation invoked lookup")
			}
		}
	}
}
