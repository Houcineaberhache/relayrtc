import { describe, expect, it } from "vitest";

import {
  developmentInternalSecret,
  enforceCredentialPolicy,
  readInternalSecret,
} from "./credential-policy.js";

describe("credential policy", () => {
  it.each([
    "file:///tmp/control",
    "https://user:private-value@media/internal/v1",
    "http://media/internal/v1?secret=private-value",
    "http://media/internal/v1#fragment",
  ])("rejects invalid internal service URLs without disclosure", (value) => {
    expect(() => {
      enforceCredentialPolicy({ RELAYRTC_MEDIA_INTERNAL_URL: value });
    }).toThrow("RELAYRTC_MEDIA_INTERNAL_URL");
    expect(() => {
      enforceCredentialPolicy({ RELAYRTC_SIGNALING_INTERNAL_URL: value });
    }).toThrow("RELAYRTC_SIGNALING_INTERNAL_URL");
    try {
      enforceCredentialPolicy({ RELAYRTC_SIGNALING_INTERNAL_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
  it.each([undefined, "development", "test"])(
    "keeps a separate local control default in %s",
    (NODE_ENV) => {
      expect(
        readInternalSecret({
          NODE_ENV,
          PARTICIPANT_TOKEN_SIGNING_SECRET: "local-participant-signing-secret-value",
        }),
      ).toBe(developmentInternalSecret);
    },
  );

  it.each(["development", "test", "production"])(
    "rejects credential reuse in %s without exposing values",
    (NODE_ENV) => {
      const secret = "private-credential-not-to-be-printed";
      try {
        enforceCredentialPolicy({
          NODE_ENV,
          RELAYRTC_INTERNAL_SECRET: secret,
          PARTICIPANT_TOKEN_SIGNING_SECRET: secret,
        });
        expect.fail("accepted reused credentials");
      } catch (error) {
        expect(String(error)).toContain("must use separate credentials");
        expect(String(error)).not.toContain(secret);
      }
    },
  );

  it.each([
    "replace-with-at-least-32-random-characters",
    developmentInternalSecret,
    "test-credential-with-at-least-32-characters",
    "a".repeat(32),
    "0123456789abcdef0123456789abcdef",
  ])("rejects production placeholders", (secret) => {
    expect(() =>
      readInternalSecret({ NODE_ENV: "production", RELAYRTC_INTERNAL_SECRET: secret }),
    ).toThrow("placeholder");
  });

  it.each(["BETTER_AUTH_SECRET", "TURN_SHARED_SECRET", "PARTICIPANT_TOKEN_SIGNING_SECRET"])(
    "rejects control reuse by %s",
    (name) => {
      expect(() =>
        readInternalSecret({
          RELAYRTC_INTERNAL_SECRET: "private-credential-not-to-be-printed",
          [name]: "private-credential-not-to-be-printed",
        }),
      ).toThrow("separate credentials");
    },
  );

  it("rejects unknown modes and does not fall back in production", () => {
    expect(() => readInternalSecret({ NODE_ENV: "staging" })).toThrow("NODE_ENV");
    expect(() => readInternalSecret({ NODE_ENV: "production" })).toThrow("production");
  });
});
