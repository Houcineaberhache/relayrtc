import { describe, expect, it } from "vitest";

import {
  oauthCallbackPath,
  oauthCallbackUrl,
  oauthProviderSchema,
  toOAuthCallbackError,
} from "./oauth.js";

describe("OAuth helpers", () => {
  it.each([
    ["github", "/api/auth/callback/github"],
    ["google", "/api/auth/callback/google"],
  ] as const)("builds the %s callback", (provider, path) => {
    expect(oauthProviderSchema.parse(provider)).toBe(provider);
    expect(oauthCallbackPath(provider)).toBe(path);
    expect(oauthCallbackUrl("http://localhost:3001", provider)).toBe(
      `http://localhost:3001${path}`,
    );
  });

  it("rejects unsupported providers", () => {
    expect(oauthProviderSchema.safeParse("facebook").success).toBe(false);
  });

  it("normalizes OAuth callback errors", () => {
    expect(toOAuthCallbackError("account_not_linked")).toEqual({
      code: "OAUTH_ACCOUNT_CONFLICT",
      description: "Sign in with the originally linked method before connecting this account",
    });
    expect(toOAuthCallbackError("unexpected_provider_response")).toEqual({
      code: "OAUTH_FAILED",
      description: "OAuth authentication could not be completed",
    });
    expect(toOAuthCallbackError(null)).toBeNull();
  });
});
