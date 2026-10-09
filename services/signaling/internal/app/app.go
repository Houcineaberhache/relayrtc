package app

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/relayrtc/relayrtc/services/signaling/internal/config"
	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

func Run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return err
	}
	runtimeContext, cancelRuntime := context.WithCancel(ctx)
	defer cancelRuntime()
	admissionContext, cancelAdmission := context.WithTimeout(ctx, 10*time.Second)
	owner, err := session.AcquireNodeLease(admissionContext, cfg.DatabaseURL, cfg.SignalingNodeID)
	cancelAdmission()
	if err != nil {
		return err
	}
	defer owner.Close()
	leaseDone := owner.KeepAlive(runtimeContext, cancelRuntime)
	defer func() { cancelRuntime(); <-leaseDone }()
	slog.Info("signaling topology: single owner per database; replicas are rejected", "node_id", cfg.SignalingNodeID)
	store := session.NewStore(pool, cfg.LocationRetention)
	store.SetSignalingInstance(owner.InstanceID)
	connectionOptions, mediaAdapter, mediaHTTP, err := newConnectionOptions(ctx, cfg, pool, store)
	if err != nil {
		return err
	}
	defer mediaHTTP.Close()
	connectionOptions.Shutdown = runtimeContext
	runtimeDone := runRTCReconciliation(runtimeContext, mediaAdapter)
	defer func() { cancelRuntime(); <-runtimeDone }()
	cleanupContext, cleanupCancel := context.WithTimeout(ctx, 10*time.Second)
	err = store.PurgeLocations(cleanupContext, time.Now().Add(-cfg.LocationRetention), !cfg.StoreParticipantIP)
	cleanupCancel()
	if err != nil {
		return err
	}
	retentionContext, cancelRetention := context.WithCancel(runtimeContext)
	retentionDone := runLocationRetention(retentionContext, store, cfg.LocationRetention, !cfg.StoreParticipantIP, time.Hour)
	defer func() { cancelRetention(); <-retentionDone }()
	connections := connection.NewHandler(connectionOptions)
	removalContext, cancelRemoval := context.WithCancel(runtimeContext)
	removalDone := runParticipantRemoval(removalContext, pool, connections, cfg.SignalingNodeID, owner.InstanceID)
	defer func() { cancelRemoval(); <-removalDone }()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health("ok"))
	mux.HandleFunc("GET /ready", func(response http.ResponseWriter, request *http.Request) {
		if runtimeContext.Err() != nil {
			http.Error(response, "signaling owner unavailable", http.StatusServiceUnavailable)
			return
		}
		health("ready")(response, request)
	})
	mux.Handle("GET /v1/connect", connections)
	mux.HandleFunc("POST /internal/v1/rooms/{roomId}/end", endRoom(connections, cfg.InternalSecret))
	mux.HandleFunc("POST /internal/v1/rooms/{roomId}/participants/{participantId}/remove", removeParticipant(pool, connections, cfg.InternalSecret, cfg.SignalingNodeID, owner.InstanceID))
	mux.HandleFunc("POST /internal/v1/rooms/{roomId}/quality-events", qualityEvents(connections, cfg.InternalSecret))

	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           mux,
		IdleTimeout:       90 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("signaling service listening", "address", cfg.Address)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case err = <-leaseDone:
	case <-ctx.Done():
	}
	cancelRuntime()

	shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	shutdownError := server.Shutdown(shutdownContext)
	waitError := connections.Wait(shutdownContext)
	return errors.Join(err, shutdownError, waitError)
}

func health(status string) http.HandlerFunc {
	return func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]string{
			"service": "relayrtc-signaling",
			"status":  status,
		})
	}
}
