import { z } from "zod";

import { authError, toAuthError, type AuthError } from "./errors.js";

export const oauthProviders = ["github", "google"] as const;
export const oauthProviderSchema = z.enum(oauthProviders);

export type OAuthProvider = (typeof oauthProviders)[number];

export const oauthCallbackPath = (provider: OAuthProvider): string =>
  `/api/auth/callback/${provider}`;

export const oauthCallbackUrl = (baseUrl: string, provider: OAuthProvider): string =>
  new URL(oauthCallbackPath(provider), baseUrl).toString();

export const toOAuthCallbackError = (errorCode: string | null): AuthError | null => {
  if (!errorCode) {
    return null;
  }

  const error = toAuthError({ code: errorCode });
  return error.code === "AUTHENTICATION_FAILED" ? authError("OAUTH_FAILED") : error;
};
