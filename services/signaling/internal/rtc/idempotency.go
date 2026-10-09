package rtc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func RequestFingerprint(scope Scope, request SignalRequest) (string, error) {
	var payload map[string]any
	if json.Unmarshal(request.Payload, &payload) != nil || payload == nil {
		return "", ErrInvalidRequest
	}
	encoded, err := json.Marshal(struct {
		Scope   Scope          `json:"scope"`
		Type    string         `json:"type"`
		Payload map[string]any `json:"payload"`
	}{scope, request.Type, payload})
	if err != nil {
		return "", ErrInvalidRequest
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}
