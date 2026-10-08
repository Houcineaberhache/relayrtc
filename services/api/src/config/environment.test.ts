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
      internalSecret: "development-internal-secret-change-me",
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

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://relayrtc:independent-database-password@postgres:5432/relayrtc",
  PARTICIPANT_TOKEN_SIGNING_SECRET: "independent-participant-signing-key-123",
  RELAYRTC_INTERNAL_SECRET: "independent-internal-control-key-456",
  TURN_SHARED_SECRET: "independent-turn-authentication-key-789",
  RELAYRTC_MEDIA_INTERNAL_URL: "http://media:8082/internal/v1",
  RELAYRTC_SIGNALING_INTERNAL_URL: "http://signaling:8081/internal/v1",
  TURN_STUN_URLS: "stun:rtc.example.com:3478",
  TURN_URLS: "turn:rtc.example.com:3478?transport=udp",
};

describe("production API configuration", () => {
  it("accepts explicitly separated production credentials", () => {
    expect(readApiEnvironment(productionEnvironment).internalSecret).toBe(
      productionEnvironment.RELAYRTC_INTERNAL_SECRET,
    );
  });
  it.each([
    "RELAYRTC_INTERNAL_SECRET",
    "RELAYRTC_MEDIA_INTERNAL_URL",
    "RELAYRTC_SIGNALING_INTERNAL_URL",
    "TURN_URLS",
    "TURN_STUN_URLS",
  ])("requires %s", (name) => {
    expect(() => readApiEnvironment({ ...productionEnvironment, [name]: undefined })).toThrow(name);
  });
  it.each(["RELAYRTC_INTERNAL_SECRET", "PARTICIPANT_TOKEN_SIGNING_SECRET", "TURN_SHARED_SECRET"])(
    "rejects placeholder %s",
    (name) => {
      expect(() =>
        readApiEnvironment({
          ...productionEnvironment,
          [name]: "replace-with-at-least-32-random-characters",
        }),
      ).toThrow(name);
    },
  );
  it("rejects development database credentials without disclosure", () => {
    expect(() =>
      readApiEnvironment({
        ...productionEnvironment,
        DATABASE_URL: "postgresql://relaykit:relaykit@postgres/relaykit",
      }),
    ).toThrow("DATABASE_URL");
  });
});
