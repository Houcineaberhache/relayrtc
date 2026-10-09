import { describe, expect, it } from "vitest";

import {
  organizationUsageQuerySchema,
  projectAnalyticsQuerySchema,
  projectUsageQuerySchema,
  reportingWindowSchema,
  reportingUsageMetricsSchema,
} from "./reporting.js";

describe("reporting contracts", () => {
  it("defaults to a seven-day range without silently accepting unsupported filters", () => {
    expect(projectUsageQuerySchema.parse({})).toEqual({ range: "7d" });
    expect(projectAnalyticsQuerySchema.safeParse({ range: "14d" }).success).toBe(false);
    expect(projectUsageQuerySchema.safeParse({ range: "all" }).success).toBe(false);
    expect(projectUsageQuerySchema.safeParse({ organizationId: "org_1" }).success).toBe(false);
    expect(
      projectAnalyticsQuerySchema.safeParse({ environmentId: ["env_1", "env_2"] }).success,
    ).toBe(false);
  });
  it("bounds project breakdown pagination", () => {
    expect(organizationUsageQuerySchema.parse({ limit: "10", offset: "20" })).toEqual({
      range: "7d",
      limit: 10,
      offset: 20,
    });
    expect(organizationUsageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(organizationUsageQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });
  it("requires positive UTC reporting windows with exclusive end boundaries", () => {
    const window = {
      range: "7d",
      startedAt: "2026-10-01T00:00:00.000Z",
      endedAt: "2026-10-08T00:00:00.000Z",
      timezone: "UTC",
      endExclusive: true,
    };
    expect(reportingWindowSchema.safeParse(window).success).toBe(true);
    expect(reportingWindowSchema.safeParse({ ...window, endedAt: window.startedAt }).success).toBe(
      false,
    );
    expect(reportingWindowSchema.safeParse({ ...window, endExclusive: false }).success).toBe(false);
  });
  it("rejects negative consumption and nonfinite metrics", () => {
    expect(reportingUsageMetricsSchema.shape.participantSeconds.safeParse(-1).success).toBe(false);
    expect(reportingUsageMetricsSchema.shape.participantSeconds.safeParse(Infinity).success).toBe(
      false,
    );
    expect(reportingUsageMetricsSchema.shape.participantSeconds.parse(0.5)).toBe(0.5);
  });
});
