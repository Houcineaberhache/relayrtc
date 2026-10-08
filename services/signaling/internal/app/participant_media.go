package app

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type participantMediaClient struct {
	baseURL        string
	httpClient     *http.Client
	internalSecret string
}

func newParticipantMediaClient(baseURL, internalSecret string) *participantMediaClient {
	return &participantMediaClient{
		baseURL: strings.TrimRight(baseURL, "/"), httpClient: http.DefaultClient,
		internalSecret: internalSecret,
	}
}

func (client *participantMediaClient) RemoveParticipant(ctx context.Context, roomID, participantID string) error {
	endpoint := client.baseURL + "/rooms/" + url.PathEscape(roomID) + "/participants/" + url.PathEscape(participantID)
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create participant media cleanup request: %w", err)
	}
	authorization, err := participantCleanupAuthorization(client.internalSecret, request, roomID, participantID)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", authorization)
	response, err := client.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("remove participant media: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return fmt.Errorf("remove participant media returned HTTP %d", response.StatusCode)
	}
	return nil
}

func participantCleanupAuthorization(secret string, request *http.Request, roomID, participantID string) (string, error) {
	if len(secret) < 32 {
		return "", fmt.Errorf("media control requires an internal secret of at least 32 characters")
	}
	now := time.Now().Unix()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"aud":    "relayrtc-media-control",
		"iss":    "relayrtc-signaling",
		"iat":    now,
		"exp":    now + 30,
		"method": request.Method,
		"path":   request.URL.EscapedPath(),
		"authority": map[string]string{
			"kind":          "participant-cleanup",
			"roomId":        roomID,
			"participantId": participantID,
		},
	})
	token.Header["typ"] = "relayrtc-media-control+jwt"
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("sign participant media cleanup request: %w", err)
	}
	return "Bearer " + signed, nil
}
