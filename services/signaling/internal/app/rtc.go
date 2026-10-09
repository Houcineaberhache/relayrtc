package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
	"github.com/relayrtc/relayrtc/services/signaling/internal/config"
	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
	"github.com/relayrtc/relayrtc/services/signaling/internal/geolocation"
	"github.com/relayrtc/relayrtc/services/signaling/internal/rtc"
	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

type mediaAdapter struct{ *rtc.Adapter }

func newMediaAdapter(cfg config.Config, pool *pgxpool.Pool) (*mediaAdapter, *rtc.MediaHTTP, error) {
	media, err := rtc.NewMediaHTTP(cfg.MediaInternalURL, cfg.InternalSecret)
	if err != nil {
		return nil, nil, err
	}
	adapter, err := rtc.NewAdapter(rtc.NewPostgresStore(pool, cfg.SignalingNodeID), media, cfg.MediaNodeID)
	if err != nil {
		media.Close()
		return nil, nil, err
	}
	return &mediaAdapter{adapter}, media, nil
}

func newConnectionOptions(ctx context.Context, cfg config.Config, pool *pgxpool.Pool, store *session.Store) (connection.Options, *mediaAdapter, *rtc.MediaHTTP, error) {
	adapter, media, err := newMediaAdapter(cfg, pool)
	if err != nil {
		return connection.Options{}, nil, nil, err
	}
	var locationLookup connection.LocationLookup
	if cfg.IPInfoToken != "" {
		locationLookup = geolocation.New(cfg.IPInfoToken)
	}
	return connection.Options{
		AllowedOrigins: cfg.AllowedOrigins, HeartbeatInterval: cfg.HeartbeatInterval,
		LocationLookup: locationLookup, TrustedProxyCIDRs: cfg.TrustedProxyCIDRs,
		StoreParticipantIP: cfg.StoreParticipantIP, MaxMessageBytes: cfg.MaxMessageBytes,
		NodeID: cfg.SignalingNodeID, RTCService: adapter, PongTimeout: cfg.PongTimeout,
		RecoveryTimeout: cfg.RecoveryTimeout, SessionStore: store, Shutdown: ctx,
		Validator:    auth.NewValidator(cfg.ParticipantTokenSecret, cfg.TokenIssuer, cfg.TokenAudience, cfg.TokenKeyID),
		WriteTimeout: cfg.WriteTimeout,
	}, adapter, media, nil
}

func (adapter *mediaAdapter) Handle(ctx context.Context, claims auth.Claims, request connection.RTCSignalRequest) (connection.RTCSignalResponse, error) {
	if request.RoomID != claims.RoomID || request.ParticipantID != claims.ParticipantID {
		return connection.RTCSignalResponse{}, rtc.ErrForbidden
	}
	response, err := adapter.Adapter.Handle(ctx, claims, request.SessionID, rtc.SignalRequest{RequestID: request.RequestID, Type: request.Type, Payload: request.Payload})
	return connection.RTCSignalResponse{Type: response.Type, Payload: response.Payload}, err
}

var _ connection.RTCSignalService = (*mediaAdapter)(nil)
var _ connection.RTCSessionLifecycle = (*mediaAdapter)(nil)

func runRTCReconciliation(ctx context.Context, adapter *mediaAdapter) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		timer := time.NewTicker(30 * time.Second)
		defer timer.Stop()
		for {
			operation, cancel := context.WithTimeout(ctx, 20*time.Second)
			if err := adapter.Reconcile(operation); err != nil && ctx.Err() == nil {
				slog.Warn("RTC runtime reconciliation failed", "error", err)
			}
			cancel()
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
		}
	}()
	return done
}
