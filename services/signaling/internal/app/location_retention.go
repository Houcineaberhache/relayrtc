package app

import (
	"context"
	"log/slog"
	"time"
)

type locationRetentionStore interface {
	PurgeLocations(context.Context, time.Time, bool) error
}

func runLocationRetention(ctx context.Context, store locationRetentionStore, retention time.Duration, clearIP bool, interval time.Duration) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				cleanupContext, cancel := context.WithTimeout(ctx, 10*time.Second)
				err := store.PurgeLocations(cleanupContext, now.Add(-retention), clearIP)
				cancel()
				if err != nil && ctx.Err() == nil {
					slog.Warn("participant location retention failed")
				}
			}
		}
	}()
	return done
}
