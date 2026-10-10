package app

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
)

var qualityEventID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

type qualityEventPayload struct {
	Source          string          `json:"source,omitempty"`
	EventID         string          `json:"eventId,omitempty"`
	SessionID       string          `json:"sessionId,omitempty"`
	Metrics         *qualityMetrics `json:"metrics,omitempty"`
	Type            string          `json:"type"`
	RoomID          string          `json:"roomId"`
	ParticipantID   string          `json:"participantId"`
	PreviousQuality string          `json:"previousQuality"`
	Quality         string          `json:"quality"`
	OccurredAt      time.Time       `json:"occurredAt"`
}

type qualityMetrics struct {
	AvailableIncomingBitrate *float64 `json:"availableIncomingBitrate"`
	IncomingBitrate          *float64 `json:"incomingBitrate"`
	Jitter                   *float64 `json:"jitter"`
	RoundTripTime            *float64 `json:"roundTripTime"`
	PacketLossRatio          *float64 `json:"packetLossRatio"`
	Timestamp                float64  `json:"timestamp"`
	Stale                    bool     `json:"stale"`
}

func (metrics *qualityMetrics) valid() bool {
	if metrics == nil {
		return true
	}
	for _, value := range []*float64{metrics.AvailableIncomingBitrate, metrics.IncomingBitrate, metrics.Jitter, metrics.RoundTripTime, metrics.PacketLossRatio} {
		if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0) {
			return false
		}
	}
	return metrics.Timestamp > 0 && !math.IsInf(metrics.Timestamp, 0) && (metrics.PacketLossRatio == nil || *metrics.PacketLossRatio <= 1)
}

func qualityEvents(connections *connection.Handler, internalSecret string) http.HandlerFunc {
	var mu sync.Mutex
	latest := make(map[string]time.Time)
	seen := make(map[string]time.Time)
	return func(response http.ResponseWriter, request *http.Request) {
		provided := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
		if len(provided) != len(internalSecret) ||
			subtle.ConstantTimeCompare([]byte(provided), []byte(internalSecret)) != 1 {
			http.Error(response, "unauthorized", http.StatusUnauthorized)
			return
		}
		request.Body = http.MaxBytesReader(response, request.Body, 16*1024)
		payload := qualityEventPayload{}
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&payload) != nil || payload.RoomID != request.PathValue("roomId") ||
			(payload.Type != "connection.degraded" && payload.Type != "connection.recovered" && payload.Type != "connection.quality.changed") ||
			payload.ParticipantID == "" || payload.OccurredAt.IsZero() ||
			!validQuality(payload.PreviousQuality) || !validQuality(payload.Quality) || !payload.Metrics.valid() || decoder.Decode(new(any)) != io.EOF ||
			payload.OccurredAt.After(time.Now().Add(30*time.Second)) || payload.OccurredAt.Before(time.Now().Add(-5*time.Minute)) ||
			(payload.EventID != "" && !qualityEventID.MatchString(payload.EventID)) ||
			(payload.Source != "" && payload.Source != "media") ||
			(payload.Type == "connection.quality.changed" && (payload.EventID == "" || payload.SessionID == "")) ||
			(payload.Type == "connection.degraded" && (!healthyQuality(payload.PreviousQuality) || healthyQuality(payload.Quality))) ||
			(payload.Type == "connection.recovered" && (healthyQuality(payload.PreviousQuality) || !healthyQuality(payload.Quality))) {
			http.Error(response, "invalid quality event", http.StatusBadRequest)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		key := payload.RoomID + ":" + payload.SessionID + ":" + payload.ParticipantID
		if _, exists := seen[payload.EventID]; payload.EventID != "" && exists {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		if previous, exists := latest[key]; exists && payload.OccurredAt.Before(previous) {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		for id, observed := range seen {
			if time.Since(observed) > 5*time.Minute {
				delete(seen, id)
			}
		}
		for id, observed := range latest {
			if time.Since(observed) > 5*time.Minute {
				delete(latest, id)
			}
		}
		if len(seen) >= 16384 || len(latest) >= 16384 {
			http.Error(response, "quality event backlog limit", http.StatusServiceUnavailable)
			return
		}
		latest[key] = payload.OccurredAt
		if payload.EventID != "" {
			seen[payload.EventID] = time.Now()
		}
		event := map[string]any{
			"roomId": payload.RoomID, "participantId": payload.ParticipantID,
			"previousQuality": payload.PreviousQuality, "quality": payload.Quality,
			"occurredAt": payload.OccurredAt.UTC(),
		}
		if payload.EventID != "" {
			event["eventId"] = payload.EventID
		}
		if payload.SessionID != "" {
			event["sessionId"] = payload.SessionID
		}
		if payload.Metrics != nil {
			event["metrics"] = payload.Metrics
		}
		if payload.Source == "media" {
			event["source"] = payload.Source
		}
		connections.PublishQualityEvent(payload.RoomID, payload.Type, event)
		if payload.Type == "connection.quality.changed" {
			if healthyQuality(payload.PreviousQuality) && !healthyQuality(payload.Quality) {
				connections.PublishQualityEvent(payload.RoomID, "connection.degraded", event)
			}
			if !healthyQuality(payload.PreviousQuality) && healthyQuality(payload.Quality) {
				connections.PublishQualityEvent(payload.RoomID, "connection.recovered", event)
			}
		}
		response.WriteHeader(http.StatusNoContent)
	}
}

func healthyQuality(quality string) bool { return quality == "excellent" || quality == "good" }

func validQuality(quality string) bool {
	switch quality {
	case "excellent", "good", "poor", "critical", "lost":
		return true
	default:
		return false
	}
}
