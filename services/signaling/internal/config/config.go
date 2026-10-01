package config

import (
	"fmt"
	"net"
	"os"
)

const defaultAddress = ":8081"

type Config struct {
	Address string
}

func Load() (Config, error) {
	address := os.Getenv("RELAYRTC_SIGNALING_ADDRESS")
	if address == "" {
		address = defaultAddress
	}

	if _, err := net.ResolveTCPAddr("tcp", address); err != nil {
		return Config{}, fmt.Errorf("invalid signaling address: %w", err)
	}

	return Config{Address: address}, nil
}
