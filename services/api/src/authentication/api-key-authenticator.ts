import type { RelayKitDatabase } from "@relayrtc/database";
import { schema } from "@relayrtc/database";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { apiKeyHashMatches, apiKeyPrefixFromRaw } from "./api-key-credentials.js";

export interface ApiKeyPrincipal {
  environmentId: string;
  keyId: string;
  keyType: "publishable" | "secret";
  projectId: string;
  scopes: readonly string[];
}

export const authenticateApiKey = async (
  database: RelayKitDatabase,
  rawKey: string,
): Promise<ApiKeyPrincipal | null> => {
  const prefix = apiKeyPrefixFromRaw(rawKey);
  if (!prefix) return null;

  const [apiKey] = await database
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.prefix, prefix))
    .limit(1);

  const now = new Date();
  if (
    !apiKey ||
    (apiKey.type !== "publishable" && apiKey.type !== "secret") ||
    !apiKeyHashMatches(rawKey, apiKey.hashedSecret) ||
    apiKey.revokedAt !== null ||
    (apiKey.expiresAt !== null && apiKey.expiresAt <= now)
  ) {
    return null;
  }

  const [used] = await database
    .update(schema.apiKey)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(schema.apiKey.id, apiKey.id),
        isNull(schema.apiKey.revokedAt),
        or(isNull(schema.apiKey.expiresAt), gt(schema.apiKey.expiresAt, now)),
      ),
    )
    .returning({ id: schema.apiKey.id });

  if (!used) return null;

  return {
    environmentId: apiKey.environmentId,
    keyId: apiKey.id,
    keyType: apiKey.type,
    projectId: apiKey.projectId,
    scopes: apiKey.scopes,
  };
};
