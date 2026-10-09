import "server-only";
import { headers } from "next/headers";
import {
  organizationQuotaResponseSchema,
  organizationUsageResponseSchema,
  projectAnalyticsResponseSchema,
  projectUsageResponseSchema,
} from "@relayrtc/validation";
import type { z } from "zod";
import { fetchReporting, reportingOrigin, ReportingApiError } from "./request";
import { notFound, redirect } from "next/navigation";
import { projectPath } from "./contracts";
export { usageRange } from "./contracts";

export type UsageRange = "24h" | "7d" | "14d" | "30d";
export type AnalyticsRange = "live" | "24h" | "7d" | "30d";

async function report<T>(path: string, schema: z.ZodType<T>) {
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    return await fetchReporting(path, schema, cookie, reportingOrigin());
  } catch (error) {
    if (error instanceof ReportingApiError && error.status === 401) redirect("/auth/login");
    if (error instanceof ReportingApiError && (error.status === 403 || error.status === 404))
      notFound();
    throw error;
  }
}

export const getProjectUsage = (projectId: string, range: UsageRange, environmentId?: string) =>
  report(projectPath(projectId, "usage", range, environmentId), projectUsageResponseSchema);
export const getProjectAnalytics = (
  projectId: string,
  range: AnalyticsRange,
  environmentId?: string,
) =>
  report(projectPath(projectId, "analytics", range, environmentId), projectAnalyticsResponseSchema);
export const getOrganizationQuota = (organizationId: string) =>
  report(
    `/v1/organizations/${encodeURIComponent(organizationId)}/quota`,
    organizationQuotaResponseSchema,
  );
export const getOrganizationUsage = (organizationId: string, range: UsageRange, offset = 0) =>
  report(
    `/v1/organizations/${encodeURIComponent(organizationId)}/usage?${new URLSearchParams({ range, limit: "50", offset: String(offset) })}`,
    organizationUsageResponseSchema,
  );
