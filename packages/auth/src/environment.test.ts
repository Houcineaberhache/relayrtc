import { describe, expect, it } from "vitest";

import { readAuthEnvironment } from "./environment.js";

const validEnvironment = {
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://relaykit:password@localhost:5432/relaykit",
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
        BETTER_AUTH_URL: "https://relaykit.example.com/dashboard",
      }),
    ).toThrow("must be an origin");
  });
});
