import { describe, expect, it } from "vitest";

import { safeParseProtocolMessage } from "./messages.js";
import { request, response } from "./protocol.fixture.js";

const scope = { roomId: "room_123", sessionId: "session_123" };
const delivery = {
  messageId: "message_123",
  roomId: "room_123",
  participantId: "participant_123",
};

describe("room messaging protocol", () => {
  it("parses text message requests, acknowledgements, and deliveries", () => {
    expect(safeParseProtocolMessage(request("message.send", { ...scope, text: "hello" })).success)
      .toBe(true);
    expect(safeParseProtocolMessage(response("message.sent", { ...delivery, text: "hello" })).success)
      .toBe(true);
    expect(safeParseProtocolMessage(request("message.received", { ...delivery, text: "hello" })).success)
      .toBe(true);
  });

  it("parses named custom JSON events", () => {
    const customEvent = { name: "reaction", data: { emoji: "🔥" } };

    expect(safeParseProtocolMessage(request("event.emit", { ...scope, ...customEvent })).success)
      .toBe(true);
    expect(safeParseProtocolMessage(response("event.emitted", { ...delivery, ...customEvent })).success)
      .toBe(true);
    expect(safeParseProtocolMessage(request("event.received", { ...delivery, ...customEvent })).success)
      .toBe(true);
  });

  it("rejects empty text and invalid custom event names", () => {
    expect(safeParseProtocolMessage(request("message.send", { ...scope, text: " " })).success)
      .toBe(false);
    expect(
      safeParseProtocolMessage(request("event.emit", { ...scope, name: "Invalid Event", data: {} }))
        .success,
    ).toBe(false);
  });
});
