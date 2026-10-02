import { describe, expect, it } from "vitest";

import { readApiEnvironment } from "./environment.js";

describe("readApiEnvironment", () => {
  it("applies safe service defaults", () => {
    expect(
      readApiEnvironment({
        DATABASE_URL: "postgresql://relayrtc:password@localhost:5432/relayrtc",
      }),
    ).toEqual({
      databaseUrl: "postgresql://relayrtc:password@localhost:5432/relayrtc",
      host: "0.0.0.0",
      logLevel: "info",
      nodeEnvironment: "development",
      port: 8080,
      trustProxy: false,
    });
  });

  it("rejects invalid ports and non-PostgreSQL URLs", () => {
    expect(() =>
      readApiEnvironment({ DATABASE_URL: "mysql://localhost/relayrtc" }),
    ).toThrow("valid PostgreSQL URL");
    expect(() =>
      readApiEnvironment({
        API_PORT: "70000",
        DATABASE_URL: "postgresql://localhost/relayrtc",
      }),
    ).toThrow("API_PORT");
  });
});
