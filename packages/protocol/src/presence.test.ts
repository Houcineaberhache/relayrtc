import { describe, expect, it } from "vitest";

import { safeParseProtocolMessage } from "./messages.js";
import { participant, request, response } from "./protocol.fixture.js";

describe("participant presence protocol", () => {
  it("parses metadata updates, acknowledgements, and room events", () => {
    const updated = { ...participant, metadata: { handRaised: true, status: "speaking" } };

    expect(
      safeParseProtocolMessage(
        request("participant.metadata.update", {
          roomId: "room_123",
          participantId: "participant_123",
          sessionId: "session_123",
          metadata: updated.metadata,
        }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        response("participant.metadata.update.accepted", { participant: updated }),
      ).success,
    ).toBe(true);
    expect(
      safeParseProtocolMessage(
        request("participant.metadata.updated", { participant: updated }),
      ).success,
    ).toBe(true);
  });

  it("rejects non-object metadata and incomplete session scope", () => {
    expect(
      safeParseProtocolMessage(
        request("participant.metadata.update", {
          roomId: "room_123",
          participantId: "participant_123",
          sessionId: "session_123",
          metadata: "away",
        }),
      ).success,
    ).toBe(false);
    expect(
      safeParseProtocolMessage(
        request("participant.metadata.update", {
          roomId: "room_123",
          participantId: "participant_123",
          metadata: {},
        }),
      ).success,
    ).toBe(false);
  });
});
