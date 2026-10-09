package connection

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/relayrtc/relayrtc/services/signaling/internal/auth"
)

var ErrRTCNotAvailable = errors.New("RTC media service is not available")

var rtcResponseTypes = map[string]string{
	"rtc.capabilities.get":    "rtc.capabilities",
	"rtc.transport.create":    "rtc.transport.created",
	"rtc.transport.connect":   "rtc.transport.connected",
	"rtc.ice.restart":         "rtc.ice.restarted",
	"rtc.track.publish":       "rtc.track.publish.accepted",
	"rtc.track.control":       "rtc.track.control.accepted",
	"rtc.track.subscribe":     "rtc.track.subscribe.accepted",
	"rtc.subscription.resume": "rtc.subscription.resumed",
}

type RTCSignalRequest struct {
	RequestID     string
	Type          string
	RoomID        string
	SessionID     string
	ParticipantID string
	Payload       json.RawMessage
}

type RTCSignalResponse struct {
	Type    string
	Payload any
}

type RTCSignalService interface {
	Handle(context.Context, auth.Claims, RTCSignalRequest) (RTCSignalResponse, error)
}

type RTCSessionLifecycle interface {
	RemoveSession(context.Context, string, string, string) error
	CloseRoom(context.Context, string) error
}

type rtcSessionScope struct {
	RoomID    string `json:"roomId"`
	SessionID string `json:"sessionId"`
}

type rtcTrackPublishScope struct {
	TrackType string `json:"trackType"`
}

func (scope rtcTrackPublishScope) permission() string {
	switch scope.TrackType {
	case "audio":
		return "audio:publish"
	case "camera_video":
		return "video:publish"
	case "screen_audio", "screen_video":
		return "screen:publish"
	default:
		return ""
	}
}
