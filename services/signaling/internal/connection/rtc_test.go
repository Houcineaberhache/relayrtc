package connection

import "testing"

func TestTrackPublicationPermissions(t *testing.T) {
	tests := map[string]string{
		"audio":        "audio:publish",
		"camera_video": "video:publish",
		"screen_audio": "screen:publish",
		"screen_video": "screen:publish",
	}
	for trackType, expected := range tests {
		t.Run(trackType, func(t *testing.T) {
			if actual := (rtcTrackPublishScope{TrackType: trackType}).permission(); actual != expected {
				t.Fatalf("permission() = %q, want %q", actual, expected)
			}
		})
	}
}
