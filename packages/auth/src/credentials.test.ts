import { describe, expect, it } from "vitest";

import {
  maximumPasswordLength,
  minimumPasswordLength,
  validateSignInCredentials,
  validateSignUpCredentials,
} from "./credentials.js";

describe("email and password validation", () => {
  it("normalizes valid sign-up credentials", () => {
    expect(
      validateSignUpCredentials({
        email: "  Developer@Example.COM ",
        name: "  RelayKit Developer  ",
        password: "password123",
      }),
    ).toEqual({
      data: {
        email: "developer@example.com",
        name: "RelayKit Developer",
        password: "password123",
      },
      error: null,
      success: true,
    });
  });

  it("rejects malformed email addresses with a stable error", () => {
    expect(
      validateSignUpCredentials({
        email: "not-an-email",
        name: "Developer",
        password: "password123",
      }),
    ).toEqual({
      data: null,
      error: {
        code: "INVALID_EMAIL",
        description: "Enter a valid email address",
      },
      success: false,
    });
  });

  it.each(["", "1234567"])("rejects a password shorter than eight characters", (password) => {
    expect(
      validateSignUpCredentials({
        email: "developer@example.com",
        name: "Developer",
        password,
      }),
    ).toMatchObject({
      error: { code: "INVALID_PASSWORD" },
      success: false,
    });
  });

  it("rejects passwords longer than the configured maximum", () => {
    expect(
      validateSignUpCredentials({
        email: "developer@example.com",
        name: "Developer",
        password: "a".repeat(maximumPasswordLength + 1),
      }),
    ).toMatchObject({
      error: { code: "INVALID_PASSWORD" },
      success: false,
    });
  });

  it("accepts a password at both supported boundaries", () => {
    for (const password of ["a".repeat(minimumPasswordLength), "a".repeat(maximumPasswordLength)]) {
      expect(
        validateSignUpCredentials({
          email: "developer@example.com",
          name: "Developer",
          password,
        }).success,
      ).toBe(true);
    }
  });

  it.each(["", "1234567"])("uses the same password rules for sign-in validation", (password) => {
    expect(
      validateSignInCredentials({
        email: "developer@example.com",
        password,
      }),
    ).toEqual({
      data: null,
      error: {
        code: "INVALID_PASSWORD",
        description: "Password must contain between 8 and 128 characters",
      },
      success: false,
    });
  });
});
