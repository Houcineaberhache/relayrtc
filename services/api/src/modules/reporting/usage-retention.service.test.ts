import { describe, expect, it } from "vitest";
import { readUsageRetentionDays } from "./usage-retention.service.js";

describe("usage retention configuration", () => {
  it("defaults to a year and permits a retention window covering every reporting range", () => {
    expect(readUsageRetentionDays({})).toBe(365);
    expect(readUsageRetentionDays({ USAGE_RETENTION_DAYS: "30" })).toBe(30);
    expect(readUsageRetentionDays({ USAGE_RETENTION_DAYS: "3650" })).toBe(3650);
  });
  it.each(["", "0", "29", "3651", "1.5", "NaN", "Infinity", "365junk"])("rejects invalid retention setting %s", (value) => {
    expect(() => readUsageRetentionDays({ USAGE_RETENTION_DAYS: value })).toThrow("USAGE_RETENTION_DAYS");
  });
});
