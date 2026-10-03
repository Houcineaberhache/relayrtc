# @relayrtc/media

Internal TypeScript media service for RelayRTC.

The service owns the mediasoup worker pool, assigns one router per room, creates participant
WebRTC transports, reports worker health, and enforces configured room and transport capacity.
The vendor-neutral `MediaEngine` contract keeps mediasoup out of RelayRTC's public interfaces.

```bash
pnpm --filter @relayrtc/media build
pnpm --filter @relayrtc/media start
```

The service listens on port `8082` by default and exposes:

```text
GET /health
GET /ready
GET /internal/v1/capacity
POST /internal/v1/rooms/:roomId
DELETE /internal/v1/rooms/:roomId
GET /internal/v1/rooms/:roomId/capabilities
POST /internal/v1/rooms/:roomId/transports
```

Each worker owns a WebRTC server and requires one TCP/UDP port beginning at `MEDIA_RTC_PORT`.
`MEDIA_RTC_MAX_PORT` must include at least `MEDIA_WORKERS` ports. Set
`MEDIA_RTC_ANNOUNCED_ADDRESS` to the media node address reachable by browser clients.
