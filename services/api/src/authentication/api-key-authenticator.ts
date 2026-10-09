import type { RelayKitDatabase } from "@relayrtc/database";
import { schema } from "@relayrtc/database";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

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

  const [project] = await database
    .select({ status: schema.project.status })
    .from(schema.project)
    .where(
      and(
        eq(schema.project.id, apiKey.projectId),
        sql`EXISTS (
      SELECT 1 FROM environment e JOIN organization o ON o.id = ${schema.project.organizationId}
      WHERE e.id = ${apiKey.environmentId} AND e.project_id = ${schema.project.id}
        AND e.status = 'active' AND o.status = 'active'
    )`,
      ),
    );
  if (project?.status !== "active") {
    return null;
  }

  const [used] = await database
    .update(schema.apiKey)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(schema.apiKey.id, apiKey.id),
        sql`EXISTS (SELECT 1 FROM environment e JOIN project p ON p.id = e.project_id
          JOIN organization o ON o.id = p.organization_id
          WHERE e.id = ${apiKey.environmentId} AND p.id = ${apiKey.projectId}
            AND e.status = 'active' AND p.status = 'active' AND o.status = 'active')`,
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
