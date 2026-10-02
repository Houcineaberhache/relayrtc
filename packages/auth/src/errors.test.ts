import { describe, expect, it } from "vitest";

import {
  authError,
  toAuthError,
  toAuthResult,
  toOrganizationMemberError,
  toOrganizationSwitchError,
  toOrganizationInvitationError,
  toOrganizationUpdateError,
} from "./errors.js";

describe("authentication errors", () => {
  it.each([
    ["USER_ALREADY_EXISTS", "USER_EXISTS"],
    ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "USER_EXISTS"],
    ["INVALID_EMAIL", "INVALID_EMAIL"],
    ["INVALID_PASSWORD", "INVALID_PASSWORD"],
    ["PASSWORD_TOO_SHORT", "INVALID_PASSWORD"],
    ["PASSWORD_TOO_LONG", "INVALID_PASSWORD"],
    ["INVALID_EMAIL_OR_PASSWORD", "INVALID_CREDENTIALS"],
    ["account_not_linked", "OAUTH_ACCOUNT_CONFLICT"],
    ["email_not_found", "OAUTH_EMAIL_UNAVAILABLE"],
    ["oauth_provider_not_found", "OAUTH_PROVIDER_UNAVAILABLE"],
    ["access_denied", "OAUTH_ACCESS_DENIED"],
    ["UNAUTHORIZED", "SESSION_REQUIRED"],
    ["SESSION_EXPIRED", "SESSION_EXPIRED"],
    ["SESSION_NOT_FRESH", "SESSION_NOT_FRESH"],
    ["FAILED_TO_GET_SESSION", "SESSION_FAILED"],
    ["FAILED_TO_CREATE_SESSION", "SESSION_FAILED"],
    ["ORGANIZATION_ALREADY_EXISTS", "ORGANIZATION_SLUG_TAKEN"],
    ["ORGANIZATION_SLUG_ALREADY_TAKEN", "ORGANIZATION_SLUG_TAKEN"],
    [
      "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION",
      "ORGANIZATION_CREATION_FORBIDDEN",
    ],
    [
      "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
      "ORGANIZATION_LIMIT_REACHED",
    ],
    ["ORGANIZATION_NOT_FOUND", "ORGANIZATION_NOT_FOUND"],
    ["USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION", "ORGANIZATION_ACCESS_DENIED"],
    ["YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION", "ORGANIZATION_ACCESS_DENIED"],
    ["YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION", "ORGANIZATION_UPDATE_FORBIDDEN"],
    ["USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION", "INVITATION_ALREADY_SENT"],
    ["USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", "ORGANIZATION_MEMBER_EXISTS"],
    ["YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION", "INVITATION_FORBIDDEN"],
    ["INVITATION_NOT_FOUND", "INVITATION_NOT_FOUND"],
    ["YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", "INVITATION_RECIPIENT_MISMATCH"],
    ["MEMBER_NOT_FOUND", "ORGANIZATION_MEMBER_NOT_FOUND"],
    ["YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER", "MEMBER_ROLE_UPDATE_FORBIDDEN"],
    ["YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER", "MEMBER_REMOVAL_FORBIDDEN"],
    ["YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER", "LAST_ORGANIZATION_OWNER"],
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

  it("maps unauthorized responses without an upstream code", () => {
    expect(toAuthError({}, 401)).toEqual({
      code: "SESSION_REQUIRED",
      description: "Sign in to continue",
    });
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

  it("preserves already normalized RelayRTC errors", () => {
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

  it("uses a stable fallback for organization switching failures", () => {
    expect(toOrganizationSwitchError({ code: "DATABASE_CONNECTION_FAILED" })).toEqual({
      code: "ORGANIZATION_SWITCH_FAILED",
      description: "The active organization could not be changed",
    });
  });

  it("uses a stable fallback for organization update failures", () => {
    expect(toOrganizationUpdateError({ code: "DATABASE_CONNECTION_FAILED" })).toEqual({
      code: "ORGANIZATION_UPDATE_FAILED",
      description: "The organization settings could not be updated",
    });
  });

  it.each([
    ["send", "INVITATION_SEND_FAILED"],
    ["cancel", "INVITATION_CANCEL_FAILED"],
    ["respond", "INVITATION_RESPONSE_FAILED"],
  ] as const)("uses a stable fallback for invitation %s failures", (action, code) => {
    expect(
      toOrganizationInvitationError({ code: "DATABASE_CONNECTION_FAILED" }, action),
    ).toEqual(authError(code));
  });

  it("uses the invitation role error for an invalid invited role", () => {
    expect(toOrganizationInvitationError({ code: "ROLE_NOT_FOUND" }, "send")).toEqual(
      authError("INVALID_INVITATION_ROLE"),
    );
  });

  it.each([
    ["update-role", "MEMBER_ROLE_UPDATE_FAILED"],
    ["remove", "MEMBER_REMOVAL_FAILED"],
  ] as const)("uses a stable fallback for member %s failures", (action, code) => {
    expect(toOrganizationMemberError({ code: "DATABASE_CONNECTION_FAILED" }, action)).toEqual(
      authError(code),
    );
  });
});
