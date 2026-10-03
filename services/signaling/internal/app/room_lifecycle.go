package app

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/relayrtc/relayrtc/services/signaling/internal/connection"
	"github.com/relayrtc/relayrtc/services/signaling/internal/session"
)

func endRoom(connections *connection.Handler, internalSecret string) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		provided := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
		if len(provided) != len(internalSecret) ||
			subtle.ConstantTimeCompare([]byte(provided), []byte(internalSecret)) != 1 {
			http.Error(response, "unauthorized", http.StatusUnauthorized)
			return
		}
		request.Body = http.MaxBytesReader(response, request.Body, 64*1024)
		room := session.Room{}
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&room) != nil || room.ID != request.PathValue("roomId") ||
			room.Status != "ended" || room.EndedAt == nil {
			http.Error(response, "invalid ended room", http.StatusBadRequest)
			return
		}
		if err := connections.EndRoom(request.Context(), room); err != nil {
			http.Error(response, "room termination failed", http.StatusInternalServerError)
			return
		}
		response.WriteHeader(http.StatusNoContent)
	}
}
