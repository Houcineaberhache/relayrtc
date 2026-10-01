import { describe, expect, it } from "vitest";

import { safeParseProtocolMessage } from "./messages.js";
import { participant, request, room, session, timestamp, track } from "./protocol.fixture.js";

describe("protocol events", () => {
  it("parses room and participant lifecycle events", () => {
    const events = [
      request("room.ended", {
        room: { ...room, status: "ended", endedAt: timestamp },
      }),
      request("participant.joined", { participant }),
      request("participant.left", {
        roomId: "room_123",
        participantId: "participant_123",
        sessionId: "session_123",
        leftAt: timestamp,
      }),
      request("participant.reconnected", {
        participantId: "participant_123",
        session: { ...session, reconnectedAt: timestamp },
      }),
    ];

    for (const event of events) {
      expect(safeParseProtocolMessage(event).success).toBe(true);
    }
  });

  it("parses track lifecycle events with matching state", () => {
    const events = [
      request("track.published", { track }),
      request("track.paused", { track: { ...track, state: "paused" } }),
      request("track.resumed", { track: { ...track, state: "resumed" } }),
      request("track.unpublished", {
        track: { ...track, state: "unpublished", unpublishedAt: timestamp },
      }),
    ];

    for (const event of events) {
      expect(safeParseProtocolMessage(event).success).toBe(true);
    }
  });

  it("rejects events whose resource state contradicts the event type", () => {
    expect(safeParseProtocolMessage(request("room.ended", { room })).success).toBe(false);
    expect(safeParseProtocolMessage(request("track.paused", { track })).success).toBe(false);
    expect(
      safeParseProtocolMessage(
        request("participant.reconnected", {
          participantId: "participant_123",
          session,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects response correlation fields on asynchronous events", () => {
    expect(
      safeParseProtocolMessage({
        ...request("participant.joined", { participant }),
        requestId: "request_123",
      }).success,
    ).toBe(false);
  });
});

describe("protocol errors", () => {
  it("parses correlated and connection-level errors", () => {
    const correlated = {
      ...request("protocol.error", {
        code: "unauthorized",
        message: "Participant token is invalid",
        retryable: false,
        details: {},
      }),
      requestId: "request_123",
    };
    const connectionLevel = { ...correlated, requestId: null };

    expect(safeParseProtocolMessage(correlated).success).toBe(true);
    expect(safeParseProtocolMessage(connectionLevel).success).toBe(true);
  });

  it("rejects unknown error codes and malformed details", () => {
    expect(
      safeParseProtocolMessage({
        ...request("protocol.error", {
          code: "database_error",
          message: "Failure",
          retryable: false,
          details: {},
        }),
        requestId: null,
      }).success,
    ).toBe(false);
    expect(
      safeParseProtocolMessage({
        ...request("protocol.error", {
          code: "internal_error",
          message: "Failure",
          retryable: true,
          details: { cause: undefined },
        }),
        requestId: null,
      }).success,
    ).toBe(false);
  });
});
