import type { RelayKitDatabase } from "@relayrtc/database";
import {
  organizationUsageResponseSchema,
  type OrganizationUsageResponse,
} from "@relayrtc/validation";

import { createUsageReportQuery, usageDataQuality, type UsageRange } from "./usage-query.js";

export async function getOrganizationUsage(
  database: RelayKitDatabase,
  organizationId: string,
  options: { range: UsageRange; limit: number; offset: number },
  endedAt = new Date(),
): Promise<OrganizationUsageResponse> {
  const { query, window } = createUsageReportQuery(
    { organizationId, projectId: null, environmentId: null },
    options.range,
    endedAt,
    options,
  );
  const result = await database.execute(query);
  const row = result[0] as
    { summary: unknown; projects: unknown; total: string | number; complete: boolean } | undefined;
  return organizationUsageResponseSchema.parse({
    organizationId,
    window,
    summary: row?.summary,
    projects: row?.projects,
    pagination: { limit: options.limit, offset: options.offset, total: Number(row?.total) },
    dataQuality: usageDataQuality(row?.complete),
  });
}
