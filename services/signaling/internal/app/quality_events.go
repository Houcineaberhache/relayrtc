package app

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
)

type qualityEventPayload struct {
	Type            string    `json:"type"`
	RoomID          string    `json:"roomId"`
	ParticipantID   string    `json:"participantId"`
	PreviousQuality string    `json:"previousQuality"`
	Quality         string    `json:"quality"`
	OccurredAt      time.Time `json:"occurredAt"`
}

func qualityEvents(connections *connection.Handler, internalSecret string) http.HandlerFunc {
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
			(payload.Type != "connection.degraded" && payload.Type != "connection.recovered") ||
			payload.ParticipantID == "" || payload.OccurredAt.IsZero() ||
			!validQuality(payload.PreviousQuality) || !validQuality(payload.Quality) {
			http.Error(response, "invalid quality event", http.StatusBadRequest)
			return
		}
		connections.PublishQualityEvent(payload.RoomID, payload.Type, map[string]any{
			"roomId": payload.RoomID, "participantId": payload.ParticipantID,
			"previousQuality": payload.PreviousQuality, "quality": payload.Quality,
			"occurredAt": payload.OccurredAt.UTC(),
		})
		response.WriteHeader(http.StatusNoContent)
	}
}

func validQuality(quality string) bool {
	switch quality {
	case "excellent", "good", "poor", "critical", "lost":
		return true
	default:
		return false
	}
}
