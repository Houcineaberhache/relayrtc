import type { RelayKitDatabase } from "@relayrtc/database";
import { projectUsageResponseSchema, type ProjectUsageResponse } from "@relayrtc/validation";

import { createUsageReportQuery, usageDataQuality, type UsageRange } from "./usage-query.js";

export interface ProjectUsageScope {
  organizationId: string;
  projectId: string;
  environmentId: string | null;
}

export async function getProjectUsage(
  database: RelayKitDatabase,
  scope: ProjectUsageScope,
  range: UsageRange,
  endedAt = new Date(),
): Promise<ProjectUsageResponse> {
  const { query, window } = createUsageReportQuery(scope, range, endedAt);
  const result = await database.execute(query);
  const row = result[0] as { summary: unknown; buckets: unknown; complete: boolean; turn_coverage?: unknown } | undefined;
  return projectUsageResponseSchema.parse({
    scope,
    window,
    summary: row?.summary,
    buckets: row?.buckets,
    dataQuality: usageDataQuality(row?.complete, row?.turn_coverage),
  });
}
