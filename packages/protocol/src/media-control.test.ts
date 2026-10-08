import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createMediaControlToken,
  verifyMediaControlToken,
  type MediaControlTokenOptions,
} from "./media-control.js";

const secret = "test-media-control-secret-at-least-32-characters";
const options: MediaControlTokenOptions = {
  service: "relayrtc-signaling",
  method: "POST",
  path: "/internal/v1/rooms/room_1/transports",
  authority: {
    kind: "participant",
    roomId: "room_1",
    participantId: "participant_1",
    sessionId: "session_1",
  },
};

const sign = (header: unknown, payload: unknown): string => {
  const content = [header, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".");
  return `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
};

describe("media control tokens", () => {
  it("verifies trusted service, request and session authority", () => {
    const token = createMediaControlToken(secret, options, 1000);
    expect(verifyMediaControlToken(secret, token, 1000)).toMatchObject({
      aud: "relayrtc-media-control",
      iss: options.service,
      method: options.method,
      path: options.path,
      authority: options.authority,
      iat: 1000,
      exp: 1030,
    });
  });

  it.each([999, 1000, 1029])("accepts a live grant at %s", (now) => {
    expect(
      verifyMediaControlToken(secret, createMediaControlToken(secret, options, 1000), now),
    ).not.toBeNull();
  });

  it.each([990, 1030, 1100])("rejects expired or future grants at %s", (now) => {
    expect(
      verifyMediaControlToken(secret, createMediaControlToken(secret, options, 1000), now),
    ).toBeNull();
  });

  it.each(["", secret, "a.b", "a.b.c.d", "Bearer x", ".".repeat(5000)])(
    "rejects malformed credentials",
    (token) => {
      expect(verifyMediaControlToken(secret, token, 1000)).toBeNull();
    },
  );

  it("rejects a wrong key and tampered payload", () => {
    const token = createMediaControlToken(secret, options, 1000);
    expect(
      verifyMediaControlToken("another-secret-at-least-32-characters", token, 1000),
    ).toBeNull();
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ roomId: "room_2" })).toString("base64url");
    expect(verifyMediaControlToken(secret, parts.join("."), 1000)).toBeNull();
  });

  it.each([
    { aud: "relayrtc-realtime" },
    { iss: "unknown-service" },
    { iss: "relayrtc-api" },
    { exp: 1100 },
    { exp: 1000 },
    { authority: { kind: "participant", roomId: "room_1", participantId: "participant_1" } },
  ])("rejects invalid signed claims %j", (patch) => {
    const claims = verifyMediaControlToken(
      secret,
      createMediaControlToken(secret, options, 1000),
      1000,
    );
    expect(
      verifyMediaControlToken(
        secret,
        sign({ alg: "HS256", typ: "relayrtc-media-control+jwt" }, { ...claims, ...patch }),
        1000,
      ),
    ).toBeNull();
  });

  it.each([
    { alg: "none", typ: "relayrtc-media-control+jwt" },
    { alg: "HS512", typ: "relayrtc-media-control+jwt" },
    { alg: "HS256", typ: "JWT" },
  ])("rejects a different JWT profile %j", (header) => {
    const claims = verifyMediaControlToken(
      secret,
      createMediaControlToken(secret, options, 1000),
      1000,
    );
    expect(verifyMediaControlToken(secret, sign(header, claims), 1000)).toBeNull();
  });

  it("rejects weak service secrets and invalid authorities when issuing", () => {
    expect(() => createMediaControlToken("short", options)).toThrow();
    expect(() =>
      createMediaControlToken(secret, { ...options, service: "relayrtc-console" }),
    ).toThrow();
  });
});

it("rejects old grants after internal rotation and accepts newly signed grants", () => {
  const rotatedSecret = "new-independent-internal-control-key";
  const oldGrant = createMediaControlToken(secret, options, 1000);
  const newGrant = createMediaControlToken(rotatedSecret, options, 1000);
  expect(verifyMediaControlToken(rotatedSecret, oldGrant, 1000)).toBeNull();
  expect(verifyMediaControlToken(rotatedSecret, newGrant, 1000)).not.toBeNull();
  expect(verifyMediaControlToken(secret, newGrant, 1000)).toBeNull();
  expect(verifyMediaControlToken("independent-participant-signing-key", newGrant, 1000)).toBeNull();
});
