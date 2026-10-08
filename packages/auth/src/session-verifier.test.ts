import type { RelayKitDatabase } from "@relayrtc/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRelayKitSessionVerifier } from "./server.js";

const data = vi.hoisted(() => ({
  session: [] as Record<string, unknown>[],
  user: [] as Record<string, unknown>[],
}));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(data) };
});

const secret = "independent-console-session-secret-123";
const token = "session-token-value";
const cookieHeaders = async (baseUrl = "http://localhost:3002", signingSecret = secret) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
  const name = baseUrl.startsWith("https:")
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  return new Headers({ cookie: `${name}=${encodeURIComponent(`${token}.${signature}`)}` });
};
const verifier = (baseUrl = "http://localhost:3002") =>
  createRelayKitSessionVerifier({
    baseUrl,
    secret,
    database: {} as RelayKitDatabase,
  });

beforeEach(() => {
  const now = new Date();
  data.user = [
    {
      id: "user_1",
      name: "Test",
      email: "test@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  data.session = [
    {
      id: "session_1",
      token,
      userId: "user_1",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60_000),
    },
  ];
});

describe("console session verification", () => {
  it.each(["http://localhost:3002", "https://console.example.com"])(
    "verifies a signed session cookie for %s",
    async (baseUrl) => {
      await expect(verifier(baseUrl)(await cookieHeaders(baseUrl))).resolves.toEqual({
        userId: "user_1",
      });
    },
  );
  it("rejects unsigned and forged cookies", async () => {
    const verify = verifier();
    await expect(
      verify(new Headers({ cookie: `better-auth.session_token=${token}` })),
    ).resolves.toBeNull();
    await expect(verify(await cookieHeaders(undefined, "another-secret"))).resolves.toBeNull();
    await expect(verify(new Headers())).resolves.toBeNull();
  });
  it("rejects expired sessions", async () => {
    const session = data.session[0];
    if (!session) throw new Error("Missing fixture");
    session.expiresAt = new Date(Date.now() - 1000);
    await expect(verifier()(await cookieHeaders())).resolves.toBeNull();
  });
  it("rejects revoked sessions on the next request", async () => {
    const verify = verifier();
    await expect(verify(await cookieHeaders())).resolves.toEqual({ userId: "user_1" });
    data.session = [];
    await expect(verify(await cookieHeaders())).resolves.toBeNull();
  });
});
