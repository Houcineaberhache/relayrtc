package app

import (
	"context"
	"errors"
	"testing"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
	"github.com/relayrtc/relayrtc/services/signaling/internal/config"
	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
	"github.com/relayrtc/relayrtc/services/signaling/internal/rtc"
)

func TestProductionMediaAdapterConstruction(t *testing.T) {
	cfg := config.Config{MediaInternalURL: "http://127.0.0.1:8082/internal/v1", InternalSecret: "test-production-construction-secret-123", MediaNodeID: "media-local", SignalingNodeID: "signaling-local"}
	options, adapter, media, err := newConnectionOptions(context.Background(), cfg, nil, nil)
	if err != nil || adapter == nil || media == nil {
		t.Fatalf("production media construction failed: %v", err)
	}
	defer media.Close()
	if options.RTCService == nil || options.RTCService != adapter {
		t.Fatal("production RTC service was not registered")
	}
	if _, ok := options.RTCService.(connection.RTCSessionLifecycle); !ok {
		t.Fatal("runtime cleanup was not registered")
	}
	_, err = options.RTCService.Handle(context.Background(), auth.Claims{RoomID: "room", ParticipantID: "participant"}, connection.RTCSignalRequest{RoomID: "other", ParticipantID: "participant"})
	if !errors.Is(err, rtc.ErrForbidden) {
		t.Fatal("production adapter accepted an untrusted request scope")
	}
	cfg.MediaNodeID = ""
	if _, _, err := newMediaAdapter(cfg, nil); err == nil {
		t.Fatal("missing placement identity accepted")
	}
}
