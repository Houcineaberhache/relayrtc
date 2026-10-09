package connection

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

type ResourceLimits struct {
	MessagesPerNode        int
	Connections            int
	ConnectionsPerIP       int
	ConnectionsPerProject  int
	ConnectionsPerRoom     int
	ConnectsPerIPPerMinute int
	MessagesPerConnection  int
	MessagesPerIP          int
	MessagesPerProject     int
	MessagesPerRoom        int
	OutboundMessages       int
	OutboundBytes          int
	TrackedScopes          int
}

func DefaultResourceLimits() ResourceLimits {
	return ResourceLimits{
		MessagesPerNode: 10000, Connections: 4096, ConnectionsPerIP: 128,
		ConnectionsPerProject: 1024, ConnectionsPerRoom: 256, ConnectsPerIPPerMinute: 120,
		MessagesPerConnection: 60, MessagesPerIP: 600, MessagesPerProject: 2000,
		MessagesPerRoom: 1000, OutboundMessages: 64, OutboundBytes: 2097152, TrackedScopes: 10000,
	}
}

type rateScope struct {
	key    string
	limit  int
	window time.Duration
}
type rateBucket struct {
	count   int
	expires time.Time
}
type resourceLimiter struct {
	mu          sync.Mutex
	limits      ResourceLimits
	rates       map[string]rateBucket
	connections map[string]int
	total       int
	prunedAt    time.Time
}

func newResourceLimiter(limits ResourceLimits) *resourceLimiter {
	return &resourceLimiter{limits: limits, rates: make(map[string]rateBucket), connections: make(map[string]int)}
}

func scopeIP(ip string) string { sum := sha256.Sum256([]byte(ip)); return hex.EncodeToString(sum[:]) }

func (limiter *resourceLimiter) allow(scopes ...rateScope) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	now := time.Now()
	if now.Sub(limiter.prunedAt) >= time.Second {
		for key, bucket := range limiter.rates {
			if !bucket.expires.After(now) {
				delete(limiter.rates, key)
			}
		}
		limiter.prunedAt = now
	}
	for _, scope := range scopes {
		bucket, exists := limiter.rates[scope.key]
		if !exists || !bucket.expires.After(now) {
			if !exists && len(limiter.rates) >= limiter.limits.TrackedScopes {
				return false
			}
			bucket = rateBucket{expires: now.Add(scope.window)}
		}
		if bucket.count >= scope.limit {
			return false
		}
		bucket.count++
		limiter.rates[scope.key] = bucket
	}
	return true
}

func (limiter *resourceLimiter) acquire(ip, projectID, roomID string) (func(), bool) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	scopes := []rateScope{{"ip:" + ip, limiter.limits.ConnectionsPerIP, 0}, {"project:" + projectID, limiter.limits.ConnectionsPerProject, 0}, {"room:" + projectID + ":" + roomID, limiter.limits.ConnectionsPerRoom, 0}}
	if limiter.total >= limiter.limits.Connections {
		return nil, false
	}
	for _, scope := range scopes {
		if limiter.connections[scope.key] >= scope.limit {
			return nil, false
		}
	}
	limiter.total++
	for _, scope := range scopes {
		limiter.connections[scope.key]++
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			limiter.mu.Lock()
			defer limiter.mu.Unlock()
			limiter.total--
			for _, scope := range scopes {
				limiter.connections[scope.key]--
				if limiter.connections[scope.key] == 0 {
					delete(limiter.connections, scope.key)
				}
			}
		})
	}, true
}
