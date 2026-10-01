import { z } from "zod";

import { authError, type AuthError } from "./errors.js";

export const minimumPasswordLength = 8;
export const maximumPasswordLength = 128;

export const emailAddressSchema = z
  .string()
  .trim()
  .max(320)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

export const passwordSchema = z.string().min(minimumPasswordLength).max(maximumPasswordLength);

export const signUpCredentialsSchema = z
  .object({
    email: emailAddressSchema,
    name: z.string().trim().min(1).max(120),
    password: passwordSchema,
  })
  .strict();

export const signInCredentialsSchema = z
  .object({
    email: emailAddressSchema,
    password: passwordSchema,
  })
  .strict();

export type SignUpCredentials = z.infer<typeof signUpCredentialsSchema>;
export type SignInCredentials = z.infer<typeof signInCredentialsSchema>;

export type CredentialsValidationResult<T> =
  { data: T; error: null; success: true } | { data: null; error: AuthError; success: false };

const validationErrorForPath = (path: PropertyKey | undefined): AuthError => {
  if (path === "email") {
    return authError("INVALID_EMAIL");
  }

  if (path === "password") {
    return authError("INVALID_PASSWORD");
  }

  if (path === "name") {
    return authError("INVALID_NAME");
  }

  return authError("INVALID_REQUEST");
};

const validateCredentials = <T>(
  schema: z.ZodType<T>,
  input: unknown,
): CredentialsValidationResult<T> => {
  const result = schema.safeParse(input);

  if (result.success) {
    return { data: result.data, error: null, success: true };
  }

  return {
    data: null,
    error: validationErrorForPath(result.error.issues[0]?.path[0]),
    success: false,
  };
};

export const validateSignUpCredentials = (
  input: unknown,
): CredentialsValidationResult<SignUpCredentials> =>
  validateCredentials(signUpCredentialsSchema, input);

export const validateSignInCredentials = (
  input: unknown,
): CredentialsValidationResult<SignInCredentials> =>
  validateCredentials(signInCredentialsSchema, input);
