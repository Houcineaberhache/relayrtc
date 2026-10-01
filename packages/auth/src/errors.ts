export const authErrorCodes = [
  "INVALID_REQUEST",
  "INVALID_NAME",
  "INVALID_EMAIL",
  "INVALID_PASSWORD",
  "INVALID_CREDENTIALS",
  "USER_EXISTS",
  "RATE_LIMITED",
  "OAUTH_ACCESS_DENIED",
  "OAUTH_ACCOUNT_CONFLICT",
  "OAUTH_EMAIL_UNAVAILABLE",
  "OAUTH_PROVIDER_UNAVAILABLE",
  "OAUTH_FAILED",
  "SESSION_REQUIRED",
  "SESSION_EXPIRED",
  "SESSION_NOT_FRESH",
  "SESSION_FAILED",
  "AUTHENTICATION_FAILED",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly description: string;
}

const authErrorDescriptions: Readonly<Record<AuthErrorCode, string>> = {
  INVALID_REQUEST: "The authentication request is invalid",
  INVALID_NAME: "Enter a valid name",
  INVALID_EMAIL: "Enter a valid email address",
  INVALID_PASSWORD: "Password must contain between 8 and 128 characters",
  INVALID_CREDENTIALS: "The email address or password is incorrect",
  USER_EXISTS: "A user already exists with this email address",
  RATE_LIMITED: "Too many authentication attempts. Try again later",
  OAUTH_ACCESS_DENIED: "OAuth access was not granted",
  OAUTH_ACCOUNT_CONFLICT:
    "Sign in with the originally linked method before connecting this account",
  OAUTH_EMAIL_UNAVAILABLE: "The OAuth provider did not return a usable email address",
  OAUTH_PROVIDER_UNAVAILABLE: "The requested OAuth provider is unavailable",
  OAUTH_FAILED: "OAuth authentication could not be completed",
  SESSION_REQUIRED: "Sign in to continue",
  SESSION_EXPIRED: "Your session has expired. Sign in again",
  SESSION_NOT_FRESH: "Sign in again to perform this action",
  SESSION_FAILED: "The session operation could not be completed",
  AUTHENTICATION_FAILED: "Authentication could not be completed",
};

export const authError = (code: AuthErrorCode): AuthError => ({
  code,
  description: authErrorDescriptions[code],
});

const betterAuthCodeMap: Readonly<Record<string, AuthErrorCode>> = {
  EMAIL_PASSWORD_DISABLED: "AUTHENTICATION_FAILED",
  EMAIL_PASSWORD_SIGN_UP_DISABLED: "AUTHENTICATION_FAILED",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_EMAIL_OR_PASSWORD: "INVALID_CREDENTIALS",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER: "OAUTH_ACCOUNT_CONFLICT",
  ACCOUNT_NOT_LINKED: "OAUTH_ACCOUNT_CONFLICT",
  EMAIL_NOT_VERIFIED: "OAUTH_EMAIL_UNAVAILABLE",
  EMAIL_NOT_FOUND: "OAUTH_EMAIL_UNAVAILABLE",
  FAILED_TO_CREATE_SESSION: "SESSION_FAILED",
  FAILED_TO_GET_SESSION: "SESSION_FAILED",
  FAILED_TO_CREATE_USER: "OAUTH_FAILED",
  FAILED_TO_GET_USER_INFO: "OAUTH_FAILED",
  PASSWORD_TOO_LONG: "INVALID_PASSWORD",
  PASSWORD_TOO_SHORT: "INVALID_PASSWORD",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_NOT_FRESH: "SESSION_NOT_FRESH",
  OAUTH_PROVIDER_NOT_FOUND: "OAUTH_PROVIDER_UNAVAILABLE",
  TOO_MANY_REQUESTS: "RATE_LIMITED",
  UNABLE_TO_LINK_ACCOUNT: "OAUTH_ACCOUNT_CONFLICT",
  UNAUTHORIZED: "SESSION_REQUIRED",
  USER_ALREADY_EXISTS: "USER_EXISTS",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "USER_EXISTS",
  access_denied: "OAUTH_ACCESS_DENIED",
  account_already_linked_to_different_user: "OAUTH_ACCOUNT_CONFLICT",
  account_not_linked: "OAUTH_ACCOUNT_CONFLICT",
  email_does_not_match: "OAUTH_ACCOUNT_CONFLICT",
  email_not_found: "OAUTH_EMAIL_UNAVAILABLE",
  invalid_callback_request: "OAUTH_FAILED",
  invalid_code: "OAUTH_FAILED",
  no_code: "OAUTH_FAILED",
  state_invalid: "OAUTH_FAILED",
  state_mismatch: "OAUTH_FAILED",
  state_not_found: "OAUTH_FAILED",
  oauth_provider_not_found: "OAUTH_PROVIDER_UNAVAILABLE",
  unable_to_create_session: "OAUTH_FAILED",
  unable_to_create_user: "OAUTH_FAILED",
  unable_to_get_user_info: "OAUTH_FAILED",
  unable_to_link_account: "OAUTH_ACCOUNT_CONFLICT",
};

const authErrorCodeSet = new Set<string>(authErrorCodes);

const readStringProperty = (value: unknown, property: string): string | undefined => {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
};

const readNumberProperty = (value: unknown, property: string): number | undefined => {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "number" ? propertyValue : undefined;
};

const validationErrorCode = (message: string | undefined): AuthErrorCode => {
  if (message?.includes("body.email")) {
    return "INVALID_EMAIL";
  }

  if (message?.includes("body.password")) {
    return "INVALID_PASSWORD";
  }

  if (message?.includes("body.name")) {
    return "INVALID_NAME";
  }

  return "INVALID_REQUEST";
};

export const toAuthError = (error: unknown): AuthError => {
  const sourceCode = readStringProperty(error, "code");
  const status = readStringProperty(error, "status");
  const statusCode = readNumberProperty(error, "status") ?? readNumberProperty(error, "statusCode");
  const code = sourceCode ? betterAuthCodeMap[sourceCode] : undefined;

  if (sourceCode && authErrorCodeSet.has(sourceCode)) {
    return authError(sourceCode as AuthErrorCode);
  }

  if (code) {
    return authError(code);
  }

  if (sourceCode === "VALIDATION_ERROR") {
    return authError(validationErrorCode(readStringProperty(error, "message")));
  }

  if (status === "TOO_MANY_REQUESTS" || statusCode === 429) {
    return authError("RATE_LIMITED");
  }

  return authError("AUTHENTICATION_FAILED");
};

export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError };

export const toAuthResult = <T>(result: { data?: T | null; error?: unknown }): AuthResult<T> => {
  if (result.error) {
    return { data: null, error: toAuthError(result.error) };
  }

  if (result.data !== null && result.data !== undefined) {
    return { data: result.data, error: null };
  }

  return { data: null, error: authError("AUTHENTICATION_FAILED") };
};
