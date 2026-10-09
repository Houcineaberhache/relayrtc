import { describe, expect, it } from "vitest";
import { projectPath, usageRange } from "./contracts";

describe("reporting filters", () => {
  it("maps all environments to an omitted API filter", () => {
    expect(projectPath("project_test", "analytics", "live", "all")).toBe(
      "/v1/projects/project_test/analytics?range=live",
    );
    expect(projectPath("project_test", "usage", "14d")).toBe(
      "/v1/projects/project_test/usage?range=14d",
    );
  });
  it("passes a selected environment as environmentId and encodes identifiers", () => {
    const url = new URL(
      projectPath("project/other", "usage", "30d", "environment&other"),
      "http://api:8080",
    );
    expect(url.pathname).toBe("/v1/projects/project%2Fother/usage");
    expect(url.searchParams.get("environmentId")).toBe("environment&other");
    expect([...url.searchParams.keys()]).toEqual(["range", "environmentId"]);
  });
  it.each(["24h", "7d", "14d", "30d"] as const)("preserves supported range %s", (range) => {
    expect(usageRange(range)).toBe(range);
  });
  it("defaults unsupported or missing ranges to seven days", () => {
    expect(usageRange("live")).toBe("7d");
    expect(usageRange()).toBe("7d");
  });
});
