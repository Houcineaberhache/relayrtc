import { describe, expect, it, vi } from "vitest";

import {
  authorizeOrganizationReport,
  authorizeProjectReport,
  type ReportingAccessRepository,
  type ReportingPrincipal,
} from "./reporting-access.js";

const session: ReportingPrincipal = { type: "session", userId: "user_1" };
const apiKey: ReportingPrincipal = {
  type: "apiKey",
  key: {
    keyId: "key_1",
    keyType: "secret",
    projectId: "project_1",
    environmentId: "env_1",
    scopes: ["usage:read", "analytics:read"],
  },
};
const repository = (): ReportingAccessRepository => ({
  project: vi.fn().mockResolvedValue({ organizationId: "org_1", status: "active" }),
  isMember: vi.fn().mockResolvedValue(true),
  environmentBelongsToProject: vi.fn().mockResolvedValue(true),
});

describe("reporting access boundaries", () => {
  it("derives the organization and checks current membership for a session", async () => {
    const access = repository();
    await expect(
      authorizeProjectReport(access, session, "project_1", undefined, "usage:read"),
    ).resolves.toEqual({ organizationId: "org_1", projectId: "project_1", environmentId: null });
    expect(access.isMember).toHaveBeenCalledWith("org_1", "user_1");
  });
  it("hides projects and organizations from nonmembers", async () => {
    const access = repository();
    vi.mocked(access.isMember).mockResolvedValue(false);
    await expect(authorizeOrganizationReport(access, session, "org_other")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      authorizeProjectReport(access, session, "project_1", undefined, "usage:read"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it("never permits project keys to read organization reports", async () => {
    const access = repository();
    await expect(authorizeOrganizationReport(access, apiKey, "org_1")).rejects.toMatchObject({
      statusCode: 403,
      code: "ORGANIZATION_SESSION_REQUIRED",
    });
    expect(access.isMember).not.toHaveBeenCalled();
  });
  it("forces the key environment when the filter is omitted", async () => {
    const access = repository();
    await expect(
      authorizeProjectReport(access, apiKey, "project_1", undefined, "usage:read"),
    ).resolves.toEqual({ organizationId: "org_1", projectId: "project_1", environmentId: "env_1" });
    expect(access.environmentBelongsToProject).toHaveBeenCalledWith("env_1", "project_1");
  });
  it.each([
    ["project_other", undefined, "PROJECT_SCOPE_MISMATCH"],
    ["project_1", "env_other", "ENVIRONMENT_SCOPE_MISMATCH"],
  ])("rejects a key claiming %s / %s", async (projectId, environmentId, code) => {
    await expect(
      authorizeProjectReport(repository(), apiKey, projectId, environmentId, "usage:read"),
    ).rejects.toMatchObject({ statusCode: 403, code });
  });
  it.each(["publishable", "secret"] as const)(
    "requires read permission for %s keys",
    async (keyType) => {
      const principal: ReportingPrincipal = {
        type: "apiKey",
        key: { ...apiKey.key, keyType, scopes: [] },
      };
      await expect(
        authorizeProjectReport(repository(), principal, "project_1", undefined, "analytics:read"),
      ).rejects.toMatchObject({ statusCode: 403, code: "API_KEY_SCOPE_REQUIRED" });
    },
  );
  it.each([
    null,
    { organizationId: "org_1", status: "suspended" },
    { organizationId: "org_1", status: "deleting" },
  ])("rejects unavailable projects: %j", async (project) => {
    const access = repository();
    vi.mocked(access.project).mockResolvedValue(project);
    await expect(
      authorizeProjectReport(access, session, "project_1", undefined, "usage:read"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it("rejects environments outside the project even for organization members", async () => {
    const access = repository();
    vi.mocked(access.environmentBelongsToProject).mockResolvedValue(false);
    await expect(
      authorizeProjectReport(access, session, "project_1", "foreign_env", "usage:read"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
