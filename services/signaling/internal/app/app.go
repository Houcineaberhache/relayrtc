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
	store := session.NewStore(pool, cfg.LocationRetention)
	connectionOptions, mediaAdapter, mediaHTTP, err := newConnectionOptions(ctx, cfg, pool, store)
	if err != nil {
		return err
	}
	defer mediaHTTP.Close()
	runtimeContext, cancelRuntime := context.WithCancel(ctx)
	connectionOptions.Shutdown = runtimeContext
	runtimeDone := runRTCReconciliation(runtimeContext, mediaAdapter)
	defer func() { cancelRuntime(); <-runtimeDone }()
	cleanupContext, cleanupCancel := context.WithTimeout(ctx, 10*time.Second)
	err = store.PurgeLocations(cleanupContext, time.Now().Add(-cfg.LocationRetention), !cfg.StoreParticipantIP)
	cleanupCancel()
	if err != nil {
		return err
	}
	retentionContext, cancelRetention := context.WithCancel(ctx)
	retentionDone := runLocationRetention(retentionContext, store, cfg.LocationRetention, !cfg.StoreParticipantIP, time.Hour)
	defer func() { cancelRetention(); <-retentionDone }()
	connections := connection.NewHandler(connectionOptions)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health("ok"))
	mux.HandleFunc("GET /ready", health("ready"))
	mux.Handle("GET /v1/connect", connections)
	mux.HandleFunc("POST /internal/v1/rooms/{roomId}/end", endRoom(connections, cfg.InternalSecret))
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
	case <-ctx.Done():
	}

	shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	shutdownError := server.Shutdown(shutdownContext)
	waitError := connections.Wait(shutdownContext)
	return errors.Join(shutdownError, waitError)
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
