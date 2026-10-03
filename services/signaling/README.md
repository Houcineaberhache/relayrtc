# RelayRTC signaling service

The Go signaling service accepts authenticated realtime WebSocket connections at `GET /v1/connect`.

Browser clients must request both WebSocket subprotocols:

```text
relayrtc.v1
relayrtc.token.<participant JWT>
```

The server selects only `relayrtc.v1`, so the credential is not echoed as the negotiated protocol. Non-browser clients may instead send `Authorization: Bearer <participant JWT>` but must still request `relayrtc.v1`. Tokens are never accepted through query parameters.

Connections are closed when the token expires, the pong deadline is missed, the client disconnects, or the service shuts down. `/health` reports process liveness and `/ready` reports listener readiness.

After connecting, clients send a version `1` `participant.join` request containing the scoped room ID and the same participant token used for the handshake. The accepted response includes the room, local participant, durable connection session, and active participant snapshot. Joined connections receive `participant.joined` and `participant.left` discovery events. A `participant.leave` request ends the durable session and closes the connection; unexpected disconnects perform the same cleanup.

After joining, clients may negotiate RTC capabilities, transports, ICE restarts, track publication/control, and subscriptions through the `rtc.*` protocol messages. Every RTC request must match the authenticated room and joined session. Signaling forwards validated messages through the `RTCSignalService` boundary; the media/SFU implementation is connected to that boundary in the media phases.

Unexpected connection loss places the durable participant session into `reconnecting` state for the configured recovery window. A replacement socket authenticated with the same participant token can send `session.resume` with the original room ID, session ID, and participant token as its resume token. Successful recovery keeps the logical participant active and emits `participant.reconnected`. If the window expires, the session and participant are finalized and `participant.left` is emitted. Atomic database transitions and live session ownership prevent duplicate resumes.

## Configuration

- `RELAYRTC_SIGNALING_ADDRESS` — listener address, defaults to `:8081`
- `DATABASE_URL` — PostgreSQL connection used for room and participant sessions
- `RELAYRTC_SIGNALING_NODE_ID` — stable identifier recorded on connection sessions
- `RELAYRTC_SIGNALING_ALLOWED_ORIGINS` — comma-separated browser origins
- `RELAYRTC_SIGNALING_HEARTBEAT_INTERVAL` — ping interval, defaults to `20s`
- `RELAYRTC_SIGNALING_PONG_TIMEOUT` — pong deadline, defaults to `60s`
- `RELAYRTC_SIGNALING_RECOVERY_TIMEOUT` — session resume window, defaults to `30s`
- `RELAYRTC_SIGNALING_WRITE_TIMEOUT` — control-frame deadline, defaults to `10s`
- `RELAYRTC_SIGNALING_MAX_MESSAGE_BYTES` — maximum inbound message size, defaults to `65536`
- `PARTICIPANT_TOKEN_SIGNING_SECRET` — shared JWT secret of at least 32 characters
- `PARTICIPANT_TOKEN_KEY_ID` — accepted JWT signing key identifier
- `PARTICIPANT_TOKEN_ISSUER` — accepted JWT issuer
- `PARTICIPANT_TOKEN_AUDIENCE` — accepted JWT audience
