import type { RelayKitDatabase } from "@relayrtc/database";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { ApiConfig } from "./config/environment.js";

const config: ApiConfig = {
  databaseUrl: "postgresql://relayrtc:password@localhost:5432/relayrtc",
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnvironment: "test",
  participantTokenAudience: "relayrtc-realtime",
  participantTokenIssuer: "relayrtc-api",
  participantTokenKeyId: "participant-v1",
  participantTokenSigningSecret: "a-secure-participant-token-secret-123",
  port: 8080,
  trustProxy: false,
  turnCredentialTtlSeconds: 600,
  turnSharedSecret: "a-secure-turn-shared-secret-value",
  turnStunUrls: ["stun:localhost:3478"],
  turnUrls: [
    "turn:localhost:3478?transport=udp",
    "turn:localhost:3478?transport=tcp",
    "turns:localhost:5349?transport=tcp",
  ],
};

const database = {
  execute: () => Promise.resolve([]),
} as unknown as RelayKitDatabase;

const apps = new Set<ReturnType<typeof buildApp>>();

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
});

const createApp = () => {
  const app = buildApp({ config, database });
  apps.add(app);
  return app;
};

describe("RelayRTC API", () => {
  it("serves public liveness and readiness endpoints", async () => {
    const app = createApp();
    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ service: "relayrtc-api", status: "ok" });
    expect(health.headers["x-request-id"]).toBeTypeOf("string");
    expect(ready.statusCode).toBe(200);
  });

  it("protects the versioned API with the authentication hook", async () => {
    const response = await createApp().inject({ method: "GET", url: "/v1" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      description: "Provide an API key as a Bearer token",
    });
  });

  it("returns stable errors for unknown routes", async () => {
    const response = await createApp().inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });
});
