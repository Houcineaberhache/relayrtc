import type { RelayKitDatabase } from "@relayrtc/database";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateApiKey } from "../../authentication/api-key-authenticator.js";
import { registerErrorHandling } from "../../http/errors/error-handler.js";
import { createReportingAccessRepository } from "./reporting-access.js";
import { reportingRoutes } from "./reporting.routes.js";

vi.mock("../../authentication/api-key-authenticator.js", () => ({ authenticateApiKey: vi.fn() }));
vi.mock("./reporting-access.js", async (original) => ({
  ...(await original<typeof import("./reporting-access.js")>()),
  createReportingAccessRepository: vi.fn(),
}));

const access = {
  project: vi.fn(),
  isMember: vi.fn(),
  environmentBelongsToProject: vi.fn(),
};
const verifyConsoleSession = vi.fn();
const apps = new Set<FastifyInstance>();
const createApp = () => {
  const app = Fastify();
  registerErrorHandling(app);
  void app.register(reportingRoutes, {
    database: {} as RelayKitDatabase,
    verifyConsoleSession,
    prefix: "/v1",
  });
  apps.add(app);
  return app;
};
const cookie = { cookie: "better-auth.session_token=signed-session" };

beforeEach(() => {
  vi.mocked(createReportingAccessRepository).mockReturnValue(access);
  access.project.mockResolvedValue({ organizationId: "org_1", status: "active" });
  access.isMember.mockResolvedValue(true);
  access.environmentBelongsToProject.mockResolvedValue(true);
  verifyConsoleSession.mockImplementation((headers: Headers) =>
    Promise.resolve(headers.get("cookie") === cookie.cookie ? { userId: "user_1" } : null),
  );
  vi.mocked(authenticateApiKey).mockResolvedValue({
    environmentId: "env_1",
    keyId: "key_1",
    keyType: "secret",
    projectId: "project_1",
    scopes: ["usage:read", "analytics:read"],
  });
});
afterEach(async () => {
  await Promise.all([...apps].map((app) => app.close()));
  apps.clear();
  vi.clearAllMocks();
});

describe("versioned reporting routes", () => {
  it.each([
    "/v1/organizations/org_1/usage",
    "/v1/organizations/org_1/quota",
    "/v1/projects/project_1/usage",
    "/v1/projects/project_1/analytics",
  ])("requires credentials for %s", async (url) => {
    const response = await createApp().inject({ url });
    expect(response.statusCode).toBe(401);
    expect(access.project).not.toHaveBeenCalled();
    expect(access.isMember).not.toHaveBeenCalled();
  });
  it("returns unconfigured quota without a fabricated allowance", async () => {
    const response = await createApp().inject({
      url: "/v1/organizations/org_1/quota",
      headers: cookie,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      organizationId: "org_1",
      status: "unconfigured",
      limits: [],
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it.each([
    "/v1/projects/project_1/usage?range=14d",
    "/v1/projects/project_1/analytics?range=live",
    "/v1/organizations/org_1/usage?range=30d&limit=10&offset=0",
  ])("exposes a protected calculation placeholder for %s", async (url) => {
    const response = await createApp().inject({ url, headers: cookie });
    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({ code: "REPORTING_NOT_IMPLEMENTED" });
  });
  it.each([
    "/v1/projects/project_1/analytics?range=14d",
    "/v1/projects/project_1/analytics?range=all",
    "/v1/projects/project_1/usage?organizationId=org_other",
    "/v1/projects/project_1/usage?range=7d&range=30d",
    "/v1/organizations/org_1/usage?limit=101",
    "/v1/organizations/org_1/usage?offset=-1",
    "/v1/organizations/org_1/quota?range=7d",
  ])("rejects invalid queries: %s", async (url) => {
    const response = await createApp().inject({ url, headers: cookie });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("does not fall back to the console cookie for an invalid API key", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue(null);
    const response = await createApp().inject({
      url: "/v1/projects/project_1/usage",
      headers: { ...cookie, authorization: "Bearer invalid" },
    });
    expect(response.statusCode).toBe(401);
    expect(verifyConsoleSession).not.toHaveBeenCalled();
  });
  it("rejects malformed authorization even with a console cookie", async () => {
    const response = await createApp().inject({
      url: "/v1/projects/project_1/usage",
      headers: { ...cookie, authorization: "Basic invalid" },
    });
    expect(response.statusCode).toBe(401);
  });
  it.each(["usage", "quota"])(
    "rejects organization %s access with a project key",
    async (route) => {
      const response = await createApp().inject({
        url: `/v1/organizations/org_1/${route}`,
        headers: { authorization: "Bearer valid" },
      });
      expect(response.statusCode).toBe(403);
    },
  );
  it("rejects spoofed project headers", async () => {
    const response = await createApp().inject({
      url: "/v1/projects/project_1/usage",
      headers: { authorization: "Bearer valid", "x-relayrtc-project-id": "project_other" },
    });
    expect(response.statusCode).toBe(403);
  });
  it("rejects foreign environments and foreign projects", async () => {
    const app = createApp();
    for (const url of [
      "/v1/projects/project_other/usage",
      "/v1/projects/project_1/analytics?environmentId=env_other",
    ]) {
      const response = await app.inject({ url, headers: { authorization: "Bearer valid" } });
      expect(response.statusCode).toBe(403);
    }
  });
  it("rejects removed memberships on a subsequent request", async () => {
    const app = createApp();
    expect(
      (await app.inject({ url: "/v1/organizations/org_1/quota", headers: cookie })).statusCode,
    ).toBe(200);
    access.isMember.mockResolvedValue(false);
    expect(
      (await app.inject({ url: "/v1/organizations/org_1/quota", headers: cookie })).statusCode,
    ).toBe(404);
  });
});
