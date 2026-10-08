package geolocation

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

type Location struct {
	CountryCode string
	Country     string
}

type Lookup struct {
	client *http.Client
	token  string
}

func New(token string) *Lookup {
	return &Lookup{
		client: &http.Client{},
		token:  strings.TrimSpace(token),
	}
}

func (lookup *Lookup) Lookup(ctx context.Context, ip string) (Location, error) {
	if lookup == nil || lookup.token == "" {
		return Location{}, nil
	}
	parsedIP := net.ParseIP(strings.TrimSpace(ip))
	if parsedIP == nil || parsedIP.IsPrivate() || parsedIP.IsLoopback() || parsedIP.IsLinkLocalUnicast() {
		return Location{}, nil
	}

	endpoint := fmt.Sprintf(
		"https://api.ipinfo.io/lite/%s",
		url.PathEscape(ip),
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Location{}, fmt.Errorf("create IPinfo request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+lookup.token)

	response, err := lookup.client.Do(request)
	if err != nil {
		return Location{}, fmt.Errorf("request IPinfo: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Location{}, fmt.Errorf("IPinfo returned status %s", response.Status)
	}

	var payload struct {
		CountryCode string `json:"country_code"`
		Country     string `json:"country"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return Location{}, fmt.Errorf("decode IPinfo response: %w", err)
	}

	return Location{
		CountryCode: strings.TrimSpace(payload.CountryCode),
		Country:     strings.TrimSpace(payload.Country),
	}, nil
}
