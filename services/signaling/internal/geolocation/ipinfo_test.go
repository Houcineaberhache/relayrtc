package geolocation

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type testTransport func(*http.Request) (*http.Response, error)

func (transport testTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestDisabledAndNonPublicLookupsMakeNoRequest(t *testing.T) {
	for _, token := range []string{"", "configured-token"} {
		lookup := New(token)
		lookup.client.Transport = testTransport(func(*http.Request) (*http.Response, error) { t.Fatal("unexpected external request"); return nil, nil })
		ips := []string{"invalid", "127.0.0.1", "::1", "10.0.0.1", "::ffff:192.168.1.1", "0.0.0.0", "::", "224.0.0.1", "fe80::1", "fe80::1%eth0"}
		if token == "" {
			ips = append(ips, "8.8.8.8", "2606:4700:4700::1111")
		}
		for _, ip := range ips {
			if _, err := lookup.Lookup(context.Background(), ip); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestLookupUsesCanonicalIPAndDoesNotDiscloseRequestErrors(t *testing.T) {
	lookup := New("private-token")
	lookup.client.Transport = testTransport(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://api.ipinfo.io/lite/8.8.8.8" || request.Header.Get("Authorization") != "Bearer private-token" {
			t.Fatal("unexpected lookup request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"country_code":" MA ","country":" Morocco "}`)), Header: make(http.Header)}, nil
	})
	location, err := lookup.Lookup(context.Background(), "::ffff:8.8.8.8")
	if err != nil || location.CountryCode != "MA" || location.Country != "Morocco" {
		t.Fatalf("lookup failed: %v", err)
	}
	lookup.client.Transport = testTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("8.8.8.8 private-token") })
	_, err = lookup.Lookup(context.Background(), "8.8.8.8")
	if err == nil || strings.Contains(err.Error(), "8.8.8.8") || strings.Contains(err.Error(), "private-token") {
		t.Fatal("lookup error disclosed personal data")
	}
}
