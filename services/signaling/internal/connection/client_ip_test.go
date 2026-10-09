package connection

import (
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
)

func TestRequestClientIPTrustBoundary(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8"), netip.MustParsePrefix("2001:db8:10::/48")}
	cases := []struct{ name, peer, forwarded, real, expected string }{
		{"direct spoof", "198.51.100.9:1234", "203.0.113.1", "203.0.113.2", "198.51.100.9"},
		{"trusted one hop", "10.0.0.2:1234", "198.51.100.9", "203.0.113.2", "198.51.100.9"},
		{"trusted chain", "10.0.0.2:1234", "198.51.100.9, 10.0.0.1", "", "198.51.100.9"},
		{"stop at untrusted intermediary", "10.0.0.2:1234", "203.0.113.1, 198.51.100.9, 10.0.0.1", "", "198.51.100.9"},
		{"IPv6 chain", "[2001:db8:10::2]:1234", "2001:db8:20::9, 2001:db8:10::1", "", "2001:db8:20::9"},
		{"direct IPv6 spoof", "[2001:db8:20::9]:1234", "2001:db8:30::1", "", "2001:db8:20::9"},
		{"scoped socket IPv6", "[fe80::1%eth0]:1234", "203.0.113.1", "", "fe80::1"},
		{"mapped peer", "[::ffff:10.0.0.2]:1234", "::ffff:198.51.100.9", "", "198.51.100.9"},
		{"untrusted mapped peer", "[::ffff:198.51.100.9]:1234", "203.0.113.1", "", "198.51.100.9"},
		{"trusted real IP", "10.0.0.2:1234", "", "198.51.100.9", "198.51.100.9"},
		{"malformed forwarded", "10.0.0.2:1234", "invalid, 198.51.100.9", "203.0.113.1", "10.0.0.2"},
		{"empty hop", "10.0.0.2:1234", "198.51.100.9, ", "", "10.0.0.2"},
		{"zone rejected", "10.0.0.2:1234", "fe80::1%eth0", "", "10.0.0.2"},
		{"invalid peer", "hostname:1234", "198.51.100.9", "", ""},
		{"too many hops", "10.0.0.2:1234", strings.Repeat("10.0.0.1,", 65) + "198.51.100.9", "", "10.0.0.2"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/", nil)
			request.RemoteAddr = test.peer
			socketIP := requestClientIP(request, nil)
			if test.forwarded != "" {
				request.Header.Set("X-Forwarded-For", test.forwarded)
			}
			if test.real != "" {
				request.Header.Set("X-Real-IP", test.real)
			}
			if actual := requestClientIP(request, trusted); actual != test.expected {
				t.Fatalf("got %q, want %q", actual, test.expected)
			}
			if requestClientIP(request, nil) != socketIP {
				t.Fatal("default trusted caller headers")
			}
		})
	}
}

func TestMultipleForwardingHeaders(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "10.0.0.2:1234"
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	request.Header.Add("X-Forwarded-For", "203.0.113.1")
	request.Header.Add("X-Forwarded-For", "198.51.100.9, 10.0.0.1")
	if actual := requestClientIP(request, trusted); actual != "198.51.100.9" {
		t.Fatalf("incorrect combined chain: %s", actual)
	}
	request.Header.Del("X-Forwarded-For")
	request.Header.Add("X-Real-IP", "198.51.100.9")
	request.Header.Add("X-Real-IP", "203.0.113.1")
	if actual := requestClientIP(request, trusted); actual != "10.0.0.2" {
		t.Fatal("accepted ambiguous real-IP headers")
	}
}
