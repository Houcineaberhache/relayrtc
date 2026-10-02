import { describe, expect, it } from "vitest";

import { readApiEnvironment } from "./environment.js";

describe("readApiEnvironment", () => {
  it("applies safe service defaults", () => {
    expect(
      readApiEnvironment({
        DATABASE_URL: "postgresql://relayrtc:password@localhost:5432/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
      }),
    ).toEqual({
      databaseUrl: "postgresql://relayrtc:password@localhost:5432/relayrtc",
      host: "0.0.0.0",
      logLevel: "info",
      nodeEnvironment: "development",
      participantTokenAudience: "relayrtc-realtime",
      participantTokenIssuer: "relayrtc-api",
      participantTokenKeyId: "participant-v1",
      participantTokenSigningSecret: "a-secure-participant-token-secret-123",
      port: 8080,
      trustProxy: false,
    });
  });

  it("rejects invalid ports and non-PostgreSQL URLs", () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: "mysql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
      }),
    ).toThrow("valid PostgreSQL URL");
    expect(() =>
      readApiEnvironment({
        API_PORT: "70000",
        DATABASE_URL: "postgresql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
      }),
    ).toThrow("API_PORT");
  });

  it("requires a strong participant token signing secret", () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: "postgresql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "too-short",
      }),
    ).toThrow("PARTICIPANT_TOKEN_SIGNING_SECRET");
  });
});
