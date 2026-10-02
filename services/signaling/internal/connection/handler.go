package connection

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

const (
	protocolVersion   = "relayrtc.v1"
	closeTokenExpired = 4001
)

type Options struct {
	AllowedOrigins    []string
	HeartbeatInterval time.Duration
	MaxMessageBytes   int64
	PongTimeout       time.Duration
	Shutdown          context.Context
	Validator         *auth.Validator
	WriteTimeout      time.Duration
}

type Handler struct {
	heartbeatInterval time.Duration
	maxMessageBytes   int64
	pongTimeout       time.Duration
	registry          *registry
	shutdown          context.Context
	upgrader          websocket.Upgrader
	validator         *auth.Validator
	writeTimeout      time.Duration
	wg                sync.WaitGroup
}

func NewHandler(options Options) *Handler {
	allowedOrigins := make(map[string]struct{}, len(options.AllowedOrigins))
	for _, origin := range options.AllowedOrigins {
		allowedOrigins[origin] = struct{}{}
	}

	return &Handler{
		heartbeatInterval: options.HeartbeatInterval,
		maxMessageBytes:   options.MaxMessageBytes,
		pongTimeout:       options.PongTimeout,
		registry:          newRegistry(),
		shutdown:          options.Shutdown,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(request *http.Request) bool {
				origin := request.Header.Get("Origin")
				if origin == "" {
					return true
				}
				_, ok := allowedOrigins[origin]
				return ok
			},
			HandshakeTimeout: 10 * time.Second,
			Subprotocols:     []string{protocolVersion},
		},
		validator:    options.Validator,
		writeTimeout: options.WriteTimeout,
	}
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if !contains(websocket.Subprotocols(request), protocolVersion) {
		writeError(response, http.StatusBadRequest, "PROTOCOL_REQUIRED", "The relayrtc.v1 WebSocket protocol is required")
		return
	}
	rawToken, ok := auth.ExtractToken(request.Header.Get("Authorization"), websocket.Subprotocols(request))
	if !ok {
		writeError(response, http.StatusUnauthorized, "AUTHENTICATION_REQUIRED", "Provide a participant token")
		return
	}
	claims, err := handler.validator.Validate(rawToken)
	if err != nil {
		writeError(response, http.StatusUnauthorized, "INVALID_PARTICIPANT_TOKEN", "The participant token is invalid or expired")
		return
	}

	connection, err := handler.upgrader.Upgrade(response, request, nil)
	if err != nil {
		return
	}
	handler.wg.Add(1)
	defer handler.wg.Done()
	handler.registry.add(connection)
	defer handler.registry.remove(connection)
	defer connection.Close()

	slog.Info("signaling connection accepted",
		"environment_id", claims.EnvironmentID,
		"participant_id", claims.ParticipantID,
		"project_id", claims.ProjectID,
		"room_id", claims.RoomID,
		"token_id", claims.TokenID,
	)
	defer slog.Info("signaling connection disconnected",
		"participant_id", claims.ParticipantID,
		"room_id", claims.RoomID,
	)

	handler.serve(connection, claims)
}

func (handler *Handler) ActiveConnections() int {
	return handler.registry.len()
}

func (handler *Handler) Wait(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		handler.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (handler *Handler) serve(connection *websocket.Conn, claims auth.Claims) {
	connection.SetReadLimit(handler.maxMessageBytes)
	_ = connection.SetReadDeadline(time.Now().Add(handler.pongTimeout))
	connection.SetPongHandler(func(string) error {
		return connection.SetReadDeadline(time.Now().Add(handler.pongTimeout))
	})

	readError := make(chan error, 1)
	go readPump(connection, readError)
	heartbeat := time.NewTicker(handler.heartbeatInterval)
	defer heartbeat.Stop()
	expires := time.NewTimer(time.Until(claims.ExpiresAt.Time))
	defer expires.Stop()

	for {
		select {
		case <-handler.shutdown.Done():
			handler.close(connection, websocket.CloseGoingAway, "server shutting down")
			return
		case <-expires.C:
			handler.close(connection, closeTokenExpired, "participant token expired")
			return
		case err := <-readError:
			if err != nil && !websocket.IsCloseError(
				err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				closeTokenExpired,
			) && !errors.Is(err, context.Canceled) {
				slog.Debug("signaling connection read stopped", "error", err)
			}
			return
		case now := <-heartbeat.C:
			if err := connection.WriteControl(
				websocket.PingMessage,
				[]byte(now.UTC().Format(time.RFC3339Nano)),
				time.Now().Add(handler.writeTimeout),
			); err != nil {
				return
			}
		}
	}
}

func (handler *Handler) close(connection *websocket.Conn, code int, reason string) {
	_ = connection.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(code, reason),
		time.Now().Add(handler.writeTimeout),
	)
}

func readPump(connection *websocket.Conn, result chan<- error) {
	for {
		if _, _, err := connection.NextReader(); err != nil {
			result <- err
			return
		}
	}
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func writeError(response http.ResponseWriter, status int, code, description string) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]string{
		"code":        code,
		"description": description,
	})
}

type registry struct {
	connections map[*websocket.Conn]struct{}
	mu          sync.RWMutex
}

func newRegistry() *registry {
	return &registry{connections: make(map[*websocket.Conn]struct{})}
}

func (registry *registry) add(connection *websocket.Conn) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.connections[connection] = struct{}{}
}

func (registry *registry) remove(connection *websocket.Conn) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.connections, connection)
}

func (registry *registry) len() int {
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	return len(registry.connections)
}
