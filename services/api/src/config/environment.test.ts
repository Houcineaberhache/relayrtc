import { describe, expect, it } from "vitest";

import { readApiEnvironment } from "./environment.js";

describe("readApiEnvironment", () => {
  it("applies safe service defaults", () => {
    expect(
      readApiEnvironment({
        DATABASE_URL: "postgresql://relayrtc:password@localhost:5432/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
        TURN_SHARED_SECRET: "a-secure-turn-shared-secret-value",
      }),
    ).toEqual({
      databaseUrl: "postgresql://relayrtc:password@localhost:5432/relayrtc",
      host: "0.0.0.0",
      internalSecret: "a-secure-participant-token-secret-123",
      logLevel: "info",
      mediaInternalUrl: "http://media:8082/internal/v1",
      nodeEnvironment: "development",
      participantTokenAudience: "relayrtc-realtime",
      participantTokenIssuer: "relayrtc-api",
      participantTokenKeyId: "participant-v1",
      participantTokenSigningSecret: "a-secure-participant-token-secret-123",
      port: 8080,
      signalingInternalUrl: "http://signaling:8081/internal/v1",
      trustProxy: false,
      turnCredentialTtlSeconds: 600,
      turnSharedSecret: "a-secure-turn-shared-secret-value",
      turnStunUrls: ["stun:localhost:3478"],
      turnUrls: [
        "turn:localhost:3478?transport=udp",
        "turn:localhost:3478?transport=tcp",
        "turns:localhost:5349?transport=tcp",
      ],
    });
  });

  it("rejects invalid ports and non-PostgreSQL URLs", () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: "mysql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
        TURN_SHARED_SECRET: "a-secure-turn-shared-secret-value",
      }),
    ).toThrow("valid PostgreSQL URL");
    expect(() =>
      readApiEnvironment({
        API_PORT: "70000",
        DATABASE_URL: "postgresql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
        TURN_SHARED_SECRET: "a-secure-turn-shared-secret-value",
      }),
    ).toThrow("API_PORT");
  });

  it("requires a strong participant token signing secret", () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: "postgresql://localhost/relayrtc",
        PARTICIPANT_TOKEN_SIGNING_SECRET: "too-short",
        TURN_SHARED_SECRET: "a-secure-turn-shared-secret-value",
      }),
    ).toThrow("PARTICIPANT_TOKEN_SIGNING_SECRET");
  });

  it("validates TURN secrets, URLs, and credential lifetime", () => {
    const base = {
      DATABASE_URL: "postgresql://localhost/relayrtc",
      PARTICIPANT_TOKEN_SIGNING_SECRET: "a-secure-participant-token-secret-123",
      TURN_SHARED_SECRET: "a-secure-turn-shared-secret-value",
    };
    expect(() => readApiEnvironment({ ...base, TURN_SHARED_SECRET: "short" })).toThrow(
      "TURN_SHARED_SECRET",
    );
    expect(() => readApiEnvironment({ ...base, TURN_URLS: "https://turn.example.com" })).toThrow(
      "TURN_URLS",
    );
    expect(() => readApiEnvironment({ ...base, TURN_CREDENTIAL_TTL_SECONDS: "3601" })).toThrow(
      "TURN_CREDENTIAL_TTL_SECONDS",
    );
  });
});
