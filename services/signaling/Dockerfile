FROM golang:1.24-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/signaling ./cmd/signaling

FROM alpine:3.22

RUN addgroup -S relayrtc && adduser -S -G relayrtc relayrtc
COPY --from=builder --chown=relayrtc:relayrtc /out/signaling /usr/local/bin/signaling
USER relayrtc
ENTRYPOINT ["signaling"]
