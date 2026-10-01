FROM golang:1.24-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/signaling ./cmd/signaling

FROM alpine:3.22

RUN addgroup -S relaykit && adduser -S -G relaykit relaykit
COPY --from=builder --chown=relaykit:relaykit /out/signaling /usr/local/bin/signaling
USER relaykit
ENTRYPOINT ["signaling"]
