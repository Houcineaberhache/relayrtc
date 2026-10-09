import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { rtcRuntimeAuthority, rtcRuntimeCommandSchema, rtcRuntimePolicy } from "./rtc-runtime.js";
import { createMediaControlToken, verifyMediaControlToken } from "./media-control.js";
import { protocolErrorCodeSchema } from "./error.js";
import { safeParseProtocolMessage } from "./messages.js";

const fixtures = z.array(z.object({
  name: z.string(), lifecycle: z.boolean(),
  request: z.object({ requestId: z.string(), type: z.string(), payload: z.record(z.string(), z.unknown()) }),
  expected: rtcRuntimeCommandSchema,
})).parse(JSON.parse(await readFile(new URL("../fixtures/rtc-runtime.json", import.meta.url), "utf8")));

describe("shared Go and TypeScript runtime contracts", () => {
  it.each(fixtures)("validates $name without exposing runtime ownership to the client", (fixture) => {
    expect(fixture.expected.requestId).toBe(fixture.request.requestId);
    if (!fixture.lifecycle) {
      expect(safeParseProtocolMessage({ v: 1, id: fixture.request.requestId, sentAt: "2026-10-09T00:00:00Z", type: fixture.request.type, payload: fixture.request.payload }).success).toBe(true);
      expect(fixture.request.payload).not.toHaveProperty("mediaNodeId");
      expect(fixture.request.payload).not.toHaveProperty("mediaParticipantId");
    }
    if ("mediaParticipantId" in fixture.expected.scope) expect(fixture.expected.scope.mediaParticipantId).toBe(fixture.expected.scope.sessionId);
    if (fixture.expected.request.body) expect(fixture.expected.request.body).not.toHaveProperty("metadata");
    const secret = "runtime-contract-test-secret-with-at-least-32-characters";
    const authority = rtcRuntimeAuthority(fixture.expected);
    const token = createMediaControlToken(secret, { service: "relayrtc-signaling", method: fixture.expected.method, path: fixture.expected.path, authority });
    expect(verifyMediaControlToken(secret, token)?.authority).toEqual(authority);
  });

  it("rejects forged media ownership and unexpected media DTO fields", () => {
    const fixture = fixtures.find((fixture) => fixture.name === "transport");
    if (!fixture) throw new Error("Missing transport fixture");
    expect(rtcRuntimeCommandSchema.safeParse({ ...fixture.expected, scope: { ...fixture.expected.scope, mediaParticipantId: "participant_other" } }).success).toBe(false);
    expect(rtcRuntimeCommandSchema.safeParse({ ...fixture.expected, request: { operation: "transport.create", body: { participantId: "session_other", direction: "send" } } }).success).toBe(false);
    expect(rtcRuntimeCommandSchema.safeParse({ ...fixture.expected, request: { operation: "transport.create", body: { participantId: "session_rtc", direction: "send", sessionId: "forged" } } }).success).toBe(false);
    expect(rtcRuntimeCommandSchema.safeParse({ ...fixture.expected, path: "/internal/v1/rooms/room_other/transports" }).success).toBe(false);
    expect(rtcRuntimeCommandSchema.safeParse({ ...fixture.expected, method: "DELETE" }).success).toBe(false);
  });

  it("defines explicit recovery, failure and retry rules", () => {
    expect(rtcRuntimePolicy.allocation).toBe("lazy-after-authenticated-join-before-first-rtc-response");
    expect(rtcRuntimePolicy.idempotencyKey).toEqual(["sessionId", "requestId"]);
    expect(rtcRuntimePolicy.ambiguousMutationFailure).toBe("reconcile-before-retry-never-blindly-repeat");
    expect(rtcRuntimePolicy.unsupportedOperations).toContain("data-track-publish");
    for (const code of Object.values(rtcRuntimePolicy.failureCodes)) expect(protocolErrorCodeSchema.safeParse(code).success).toBe(true);
  });

  it("validates the consumer-ready response and its request correlation", () => {
    expect(safeParseProtocolMessage({ v: 1, id: "response_resume", requestId: "request_resume", sentAt: "2026-10-09T00:00:00Z", type: "rtc.subscription.resumed", payload: { roomId: "room_rtc", sessionId: "session_rtc", subscriptionId: "subscription_public" } }).success).toBe(true);
  });
});
