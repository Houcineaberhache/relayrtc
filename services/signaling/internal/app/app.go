package app

import (
	"context"
	"log/slog"

	"github.com/relaykitcc/relaykit/services/signaling/internal/config"
)

func Run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	slog.Info("signaling service initialized", "address", cfg.Address)
	<-ctx.Done()
	return nil
}
