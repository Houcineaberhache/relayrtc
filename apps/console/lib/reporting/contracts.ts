import type { UsageRange } from "./client";

export function projectPath(
  projectId: string,
  resource: string,
  range: string,
  environmentId?: string,
) {
  const query = new URLSearchParams({ range });
  if (environmentId && environmentId !== "all") query.set("environmentId", environmentId);
  return `/v1/projects/${encodeURIComponent(projectId)}/${resource}?${query}`;
}

export function usageRange(value?: string): UsageRange {
  return value === "24h" || value === "14d" || value === "30d" ? value : "7d";
}
