export const authErrorCodes = [
  "INVALID_REQUEST",
  "INVALID_NAME",
  "INVALID_EMAIL",
  "INVALID_PASSWORD",
  "INVALID_CREDENTIALS",
  "USER_EXISTS",
  "RATE_LIMITED",
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
  PASSWORD_TOO_LONG: "INVALID_PASSWORD",
  PASSWORD_TOO_SHORT: "INVALID_PASSWORD",
  TOO_MANY_REQUESTS: "RATE_LIMITED",
  USER_ALREADY_EXISTS: "USER_EXISTS",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "USER_EXISTS",
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
