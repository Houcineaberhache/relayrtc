import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { createParticipantTokenSigner } from "./participant-token.signer.js";

const secret = "a-secure-participant-token-secret-123";

describe("participant token signer", () => {
  it("signs verifiable, scoped JWT claims", async () => {
    const signer = createParticipantTokenSigner({
      audience: "relayrtc-realtime",
      issuer: "relayrtc-api",
      keyId: "participant-v1",
      secret,
    });
    const token = await signer.sign({
      environmentId: "env_development",
      expiresAt: "2026-10-02T12:10:00.000Z",
      issuedAt: "2026-10-02T12:00:00.000Z",
      metadata: { role: "host" },
      participantId: "participant_123",
      participantName: "Ada",
      permissions: ["room:join", "audio:publish"],
      projectId: "project_123",
      roomId: "room_123",
      tokenId: "ptok_123",
    });

    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      audience: "relayrtc-realtime",
      currentDate: new Date("2026-10-02T12:05:00.000Z"),
      issuer: "relayrtc-api",
    });

    expect(verified.protectedHeader).toMatchObject({
      alg: "HS256",
      kid: "participant-v1",
      typ: "JWT",
    });
    expect(verified.payload).toMatchObject({
      environmentId: "env_development",
      exp: 1_790_943_000,
      iat: 1_790_942_400,
      jti: "ptok_123",
      participantId: "participant_123",
      projectId: "project_123",
      roomId: "room_123",
      sub: "participant_123",
      tokenId: "ptok_123",
    });
  });

  it("cannot be verified with another secret", async () => {
    const signer = createParticipantTokenSigner({
      audience: "relayrtc-realtime",
      issuer: "relayrtc-api",
      keyId: "participant-v1",
      secret,
    });
    const token = await signer.sign({
      environmentId: "env_development",
      expiresAt: "2026-10-02T12:10:00.000Z",
      issuedAt: "2026-10-02T12:00:00.000Z",
      metadata: {},
      participantId: "participant_123",
      participantName: "Ada",
      permissions: ["room:join"],
      projectId: "project_123",
      roomId: "room_123",
      tokenId: "ptok_123",
    });

    await expect(
      jwtVerify(token, new TextEncoder().encode("another-secure-participant-secret-456")),
    ).rejects.toThrow();
  });
});
