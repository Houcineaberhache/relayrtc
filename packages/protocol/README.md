# @relayrtc/protocol

Versioned realtime wire contracts shared by RelayRTC clients and signaling services.

```ts
{
  v: 1,
  id: "message_123",
  sentAt: "2026-10-01T00:00:00Z",
  type: "participant.join",
  payload: {
    roomId: "room_123",
    participantToken: "token"
  }
}
```

RTC negotiation uses provider-neutral, session-scoped messages:

```text
rtc.capabilities.get       = rtc.capabilities
rtc.transport.create       = rtc.transport.created
rtc.transport.connect      = rtc.transport.connected
rtc.ice.restart            = rtc.ice.restarted
rtc.track.publish          = rtc.track.publish.accepted
rtc.track.control          = rtc.track.control.accepted
rtc.track.subscribe        = rtc.track.subscribe.accepted
```

Every RTC request carries the joined `roomId` and `sessionId`. The signaling service validates that scope before forwarding the request to the configured media service.

After an unexpected WebSocket disconnect, reconnect with the same participant token and send `session.resume` using the original `roomId`, `sessionId`, and participant token as `resumeToken`. A successful `session.resume.accepted` restores the existing logical participant rather than creating a duplicate.
