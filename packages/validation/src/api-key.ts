import { apiKeyScopes, apiKeyTypes, type ApiKey, type StoredApiKey } from "@relaykit/types";
import { z } from "zod";

import {
  apiKeyIdSchema,
  environmentIdSchema,
  isoDateTimeSchema,
  nameSchema,
  projectIdSchema,
  userIdSchema,
} from "./common.js";

export const apiKeyTypeSchema = z.enum(apiKeyTypes);
export const apiKeyScopeSchema = z.enum(apiKeyScopes);

const apiKeyShape = {
  id: apiKeyIdSchema,
  projectId: projectIdSchema,
  environmentId: environmentIdSchema,
  name: nameSchema,
  type: apiKeyTypeSchema,
  prefix: z.string().min(8).max(32),
  scopes: z
    .array(apiKeyScopeSchema)
    .max(apiKeyScopes.length)
    .refine((values) => new Set(values).size === values.length, {
      message: "API key scopes must be unique",
    }),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  createdBy: userIdSchema,
};

function hasValidApiKeyAccess(value: {
  readonly type: "publishable" | "secret";
  readonly scopes: readonly string[];
}) {
  return value.type === "secret" || value.scopes.length === 0;
}

function hasValidApiKeyExpiration(value: {
  readonly createdAt: string;
  readonly expiresAt: string | null;
}) {
  return value.expiresAt === null || Date.parse(value.expiresAt) > Date.parse(value.createdAt);
}

export const apiKeySchema: z.ZodType<ApiKey> = z
  .object(apiKeyShape)
  .strict()
  .refine(hasValidApiKeyAccess, {
    message: "Publishable API keys cannot have privileged scopes",
    path: ["scopes"],
  })
  .refine(hasValidApiKeyExpiration, {
    message: "expiresAt must follow createdAt",
    path: ["expiresAt"],
  });

export const storedApiKeySchema: z.ZodType<StoredApiKey> = z
  .object({
    ...apiKeyShape,
    hashedSecret: z.string().min(32).max(512),
  })
  .strict()
  .refine(hasValidApiKeyAccess, {
    message: "Publishable API keys cannot have privileged scopes",
    path: ["scopes"],
  })
  .refine(hasValidApiKeyExpiration, {
    message: "expiresAt must follow createdAt",
    path: ["expiresAt"],
  });
