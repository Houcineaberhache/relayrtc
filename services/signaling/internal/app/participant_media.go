package app

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
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
	request.Header.Set("Authorization", "Bearer "+client.internalSecret)
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
