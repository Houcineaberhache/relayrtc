# RelayRTC REST API

The Fastify service exposes RelayRTC's versioned public API.

## Endpoints

- `GET /health` — process liveness
- `GET /ready` — database readiness
- `GET /v1` — authenticated API-key context
- `POST /v1/rooms` — create a room (`rooms:create`)
- `GET /v1/rooms` — list scoped rooms (`rooms:read`)
- `GET /v1/rooms/:roomId` — get a scoped room (`rooms:read`)
- `DELETE /v1/rooms/:roomId` — end a scoped room (`rooms:end`)

All `/v1` routes require an API key in the `Authorization: Bearer <key>` header. The key determines the project and environment scope. Clients may also send `x-relayrtc-project-id` and `x-relayrtc-environment-id`; mismatched values are rejected.

Room listing accepts `limit`, `cursor`, and `status` query parameters. Ending a room preserves its historical record and is idempotent.

## Environment

- `DATABASE_URL` — required PostgreSQL connection URL
- `API_HOST` — listening address, defaults to `0.0.0.0`
- `API_PORT` — listening port, defaults to `8080`
- `API_LOG_LEVEL` — Pino log level, defaults to `info`
- `API_TRUST_PROXY` — whether proxy forwarding headers are trusted, defaults to `false`
