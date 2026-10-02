package app

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
	"github.com/relayrtc/relayrtc/services/signaling/internal/config"
	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
)

func Run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	validator := auth.NewValidator(
		cfg.ParticipantTokenSecret,
		cfg.TokenIssuer,
		cfg.TokenAudience,
		cfg.TokenKeyID,
	)
	connections := connection.NewHandler(connection.Options{
		AllowedOrigins:    cfg.AllowedOrigins,
		HeartbeatInterval: cfg.HeartbeatInterval,
		MaxMessageBytes:   cfg.MaxMessageBytes,
		PongTimeout:       cfg.PongTimeout,
		Shutdown:          ctx,
		Validator:         validator,
		WriteTimeout:      cfg.WriteTimeout,
	})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health("ok"))
	mux.HandleFunc("GET /ready", health("ready"))
	mux.Handle("GET /v1/connect", connections)

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
