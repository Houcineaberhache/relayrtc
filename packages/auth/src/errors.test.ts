import { describe, expect, it } from "vitest";

import { authError, toAuthError, toAuthResult } from "./errors.js";

describe("authentication errors", () => {
  it.each([
    ["USER_ALREADY_EXISTS", "USER_EXISTS"],
    ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "USER_EXISTS"],
    ["INVALID_EMAIL", "INVALID_EMAIL"],
    ["INVALID_PASSWORD", "INVALID_PASSWORD"],
    ["PASSWORD_TOO_SHORT", "INVALID_PASSWORD"],
    ["PASSWORD_TOO_LONG", "INVALID_PASSWORD"],
    ["INVALID_EMAIL_OR_PASSWORD", "INVALID_CREDENTIALS"],
  ] as const)("maps %s to %s", (sourceCode, expectedCode) => {
    expect(toAuthError({ code: sourceCode })).toEqual(authError(expectedCode));
  });

  it("does not expose unknown upstream error details", () => {
    expect(
      toAuthError({
        code: "DATABASE_CONNECTION_FAILED",
        message: "password authentication failed for database user",
      }),
    ).toEqual({
      code: "AUTHENTICATION_FAILED",
      description: "Authentication could not be completed",
    });
  });

  it("maps rate-limited responses without an upstream code", () => {
    for (const error of [{ status: "TOO_MANY_REQUESTS" }, { status: 429 }]) {
      expect(toAuthError(error)).toEqual({
        code: "RATE_LIMITED",
        description: "Too many authentication attempts. Try again later",
      });
    }
  });

  it("maps Better Auth validation errors by request field", () => {
    expect(
      toAuthError({
        code: "VALIDATION_ERROR",
        message: "[body.email] Invalid email address",
      }),
    ).toEqual({
      code: "INVALID_EMAIL",
      description: "Enter a valid email address",
    });
  });

  it("preserves already normalized RelayKit errors", () => {
    expect(toAuthError(authError("USER_EXISTS"))).toEqual(authError("USER_EXISTS"));
  });

  it("normalizes successful client results", () => {
    expect(toAuthResult({ data: { id: "user_1" }, error: null })).toEqual({
      data: { id: "user_1" },
      error: null,
    });
  });

  it("normalizes failed client results", () => {
    expect(
      toAuthResult({
        data: null,
        error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
      }),
    ).toEqual({
      data: null,
      error: {
        code: "USER_EXISTS",
        description: "A user already exists with this email address",
      },
    });
  });
});
