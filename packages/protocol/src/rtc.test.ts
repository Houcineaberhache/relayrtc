import { describe, expect, it } from "vitest";

import { safeParseProtocolMessage } from "./messages.js";
import { request, response, track } from "./protocol.fixture.js";

const scope = { roomId: "room_123", sessionId: "session_123" };
const iceParameters = { usernameFragment: "user", password: "password", iceLite: true };
const dtlsParameters = {
  role: "auto",
  fingerprints: [{ algorithm: "sha-256", value: "AA:BB:CC" }],
};

describe("RTC signaling messages", () => {
  it("parses capability and transport negotiation", () => {
    expect(safeParseProtocolMessage(request("rtc.capabilities.get", scope)).success).toBe(true);
    expect(
      safeParseProtocolMessage(
        response("rtc.transport.created", {
          ...scope,
          transportId: "transport_123",
          direction: "send",
          iceParameters,
          iceCandidates: [
            {
              foundation: "foundation",
              priority: 100,
              ip: "127.0.0.1",
              protocol: "udp",
              port: 40_000,
              type: "host",
            },
          ],
          dtlsParameters,
        }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        request("rtc.transport.connect", {
          ...scope,
          transportId: "transport_123",
          dtlsParameters,
        }),
      ).success,
    ).toBe(true);
  });

  it("parses ICE restart messages", () => {
    expect(
      safeParseProtocolMessage(
        request("rtc.ice.restart", { ...scope, transportId: "transport_123" }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        response("rtc.ice.restarted", {
          ...scope,
          transportId: "transport_123",
          iceParameters,
        }),
      ).success,
    ).toBe(true);
  });

  it("parses track publication, control, and subscription", () => {
    expect(
      safeParseProtocolMessage(
        request("rtc.track.publish", {
          ...scope,
          transportId: "transport_123",
          trackType: "camera_video",
          rtpParameters: { codecs: [] },
          metadata: {},
        }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(response("rtc.track.publish.accepted", { ...scope, track })).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        request("rtc.track.control", { ...scope, trackId: "track_123", action: "pause" }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        request("rtc.track.subscribe", {
          ...scope,
          transportId: "transport_456",
          trackId: "track_123",
          rtpCapabilities: { codecs: [] },
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects invalid directions, session scope, and control actions", () => {
    expect(
      safeParseProtocolMessage(request("rtc.transport.create", { ...scope, direction: "sideways" }))
        .success,
    ).toBe(false);
    expect(
      safeParseProtocolMessage(
        request("rtc.ice.restart", { roomId: "room_123", transportId: "transport_123" }),
      ).success,
    ).toBe(false);
    expect(
      safeParseProtocolMessage(
        request("rtc.track.control", { ...scope, trackId: "track_123", action: "delete" }),
      ).success,
    ).toBe(false);
  });
});
