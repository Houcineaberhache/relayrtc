# RelayRTC signaling service

The Go signaling service accepts authenticated realtime WebSocket connections at `GET /v1/connect`.

Browser clients must request both WebSocket subprotocols:

```text
relayrtc.v1
relayrtc.token.<participant JWT>
```

The server selects only `relayrtc.v1`, so the credential is not echoed as the negotiated protocol. Non-browser clients may instead send `Authorization: Bearer <participant JWT>` but must still request `relayrtc.v1`. Tokens are never accepted through query parameters.

Connections are closed when the token expires, the pong deadline is missed, the client disconnects, or the service shuts down. `/health` reports process liveness and `/ready` reports listener readiness.

## Configuration

- `RELAYRTC_SIGNALING_ADDRESS` — listener address, defaults to `:8081`
- `RELAYRTC_SIGNALING_ALLOWED_ORIGINS` — comma-separated browser origins
- `RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL` — ping interval, defaults to `20s`
- `RELAYRTC_SIGNALING_PONG_TIMEOUT` — pong deadline, defaults to `60s`
- `RELAYRTC_SIGNALING_WRITE_TIMEOUT` — control-frame deadline, defaults to `10s`
- `RELAYRTC_SIGNALING_MAX_MESSAGE_BYTES` — maximum inbound message size, defaults to `65536`
- `PARTICIPANT_TOKEN_SIGNING_SECRET` — shared JWT secret of at least 32 characters
- `PARTICIPANT_TOKEN_KEY_ID` — accepted JWT signing key identifier
- `PARTICIPANT_TOKEN_ISSUER` — accepted JWT issuer
- `PARTICIPANT_TOKEN_AUDIENCE` — accepted JWT audience
