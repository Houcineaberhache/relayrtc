package geolocation

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
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
		client: &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		token:  strings.TrimSpace(token),
	}
}

func (lookup *Lookup) Lookup(ctx context.Context, ip string) (Location, error) {
	if lookup == nil || lookup.token == "" {
		return Location{}, nil
	}
	parsedIP, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil || parsedIP.Zone() != "" {
		return Location{}, nil
	}
	parsedIP = parsedIP.Unmap()
	if !parsedIP.IsGlobalUnicast() || parsedIP.IsPrivate() || parsedIP.IsLoopback() || parsedIP.IsLinkLocalUnicast() {
		return Location{}, nil
	}

	endpoint := fmt.Sprintf(
		"https://api.ipinfo.io/lite/%s",
		url.PathEscape(parsedIP.String()),
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Location{}, fmt.Errorf("create IPinfo request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+lookup.token)

	response, err := lookup.client.Do(request)
	if err != nil {
		return Location{}, fmt.Errorf("IPinfo request failed")
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Location{}, fmt.Errorf("IPinfo returned status %s", response.Status)
	}

	var payload struct {
		CountryCode string `json:"country_code"`
		Country     string `json:"country"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&payload); err != nil {
		return Location{}, fmt.Errorf("decode IPinfo response: %w", err)
	}

	return Location{
		CountryCode: strings.TrimSpace(payload.CountryCode),
		Country:     strings.TrimSpace(payload.Country),
	}, nil
}
