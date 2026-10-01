import { describe, expect, it } from "vitest";

import { readAuthEnvironment } from "./environment.js";

const validEnvironment = {
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://relaykit:password@localhost:5432/relaykit",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
};

describe("readAuthEnvironment", () => {
  it("parses and deduplicates explicitly trusted origins", () => {
    expect(
      readAuthEnvironment({
        ...validEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: "https://dashboard.example.com,http://localhost:3000",
      }),
    ).toEqual({
      baseUrl: "http://localhost:3000",
      databaseUrl: validEnvironment.DATABASE_URL,
      oauthProviders: {
        github: {
          clientId: validEnvironment.GITHUB_CLIENT_ID,
          clientSecret: validEnvironment.GITHUB_CLIENT_SECRET,
        },
        google: {
          clientId: validEnvironment.GOOGLE_CLIENT_ID,
          clientSecret: validEnvironment.GOOGLE_CLIENT_SECRET,
        },
      },
      secret: validEnvironment.BETTER_AUTH_SECRET,
      trustedOrigins: ["http://localhost:3000", "https://dashboard.example.com"],
    });
  });

  it("rejects missing and weak secrets", () => {
    expect(() => readAuthEnvironment({ ...validEnvironment, BETTER_AUTH_SECRET: "short" })).toThrow(
      "at least 32 characters",
    );
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      readAuthEnvironment({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost/relaykit",
      }),
    ).toThrow("valid PostgreSQL URL");
  });

  it("rejects base URLs containing paths", () => {
    expect(() =>
      readAuthEnvironment({
        ...validEnvironment,
        BETTER_AUTH_URL: "https://relayrtc.example.com/dashboard",
      }),
    ).toThrow("must be an origin");
  });

  it.each(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])(
    "requires the %s OAuth credential",
    (name) => {
      expect(() =>
        readAuthEnvironment({
          ...validEnvironment,
          [name]: "",
        }),
      ).toThrow(`${name} is required`);
    },
  );
});
