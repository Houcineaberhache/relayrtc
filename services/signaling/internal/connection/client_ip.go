package connection

import (
	"net/http"
	"net/netip"
	"strings"
)

func requestClientIP(request *http.Request, trusted []netip.Prefix) string {
	peer, err := netip.ParseAddrPort(request.RemoteAddr)
	address := peer.Addr()
	if err != nil {
		address, err = netip.ParseAddr(request.RemoteAddr)
	}
	if err != nil {
		return ""
	}
	address = address.WithZone("").Unmap()
	if !trustedProxy(address, trusted) {
		return address.String()
	}
	values := request.Header.Values("X-Forwarded-For")
	if len(values) > 0 {
		chain := strings.Join(values, ",")
		hops := strings.Split(chain, ",")
		if len(chain) > 4096 || len(hops) > 64 {
			return address.String()
		}
		addresses := make([]netip.Addr, len(hops))
		for index, hop := range hops {
			parsed, err := netip.ParseAddr(strings.TrimSpace(hop))
			if err != nil || parsed.Zone() != "" {
				return address.String()
			}
			addresses[index] = parsed.Unmap()
		}
		for index := len(addresses) - 1; index >= 0; index-- {
			address = addresses[index]
			if !trustedProxy(address, trusted) {
				return address.String()
			}
		}
		return address.String()
	}
	realIPs := request.Header.Values("X-Real-IP")
	if len(realIPs) == 1 {
		realIP, err := netip.ParseAddr(strings.TrimSpace(realIPs[0]))
		if err == nil && realIP.Zone() == "" {
			return realIP.Unmap().String()
		}
	}
	return address.String()
}

func trustedProxy(address netip.Addr, trusted []netip.Prefix) bool {
	for _, prefix := range trusted {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}
