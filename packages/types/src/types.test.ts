import { describe, expect, expectTypeOf, it } from "vitest";

import {
  apiKeyScopes,
  connectionStates,
  environmentTypes,
  organizationMemberRoles,
  projectStatuses,
  roomQualityModeSettings,
  roomQualityModes,
  roomStatuses,
  trackStates,
  trackTypes,
  usageEventTypes,
  usageGranularities,
  webhookEventTypes,
} from "./index.js";
import type {
  ApiKey,
  EnvironmentId,
  Organization,
  OrganizationId,
  ProjectId,
  Room,
  UsageMetrics,
  WebhookEndpoint,
} from "./index.js";

describe("domain literals", () => {
  it("exports organization and project states", () => {
    expect(organizationMemberRoles).toEqual(["owner", "admin", "developer", "viewer"]);
    expect(projectStatuses).toEqual(["active", "suspended", "deleting", "deleted"]);
    expect(environmentTypes).toContain("development");
    expect(environmentTypes).toContain("production");
  });

  it("exports realtime domain states", () => {
    expect(roomStatuses).toEqual(["created", "active", "ending", "ended", "failed"]);
    expect(connectionStates).toContain("reconnecting");
    expect(trackTypes).toContain("screen_video");
    expect(trackStates).toContain("unpublished");
  });

  it("exports API, webhook, and usage literals", () => {
    expect(apiKeyScopes).toContain("tokens:create");
    expect(webhookEventTypes).toContain("connection.degraded");
    expect(usageGranularities).toEqual(["minute", "hour", "day", "month"]);
    expect(usageEventTypes).toContain("sfu.bytes.egress");
  });

  it("maps room quality presets to send and receive preferences", () => {
    expect(roomQualityModes).toEqual(["auto", "high", "balanced", "data-saver"]);
    expect(roomQualityModeSettings.high).toEqual({ receive: "1080p", send: "1080p" });
    expect(roomQualityModeSettings.balanced).toEqual({ receive: "720p", send: "720p" });
    expect(roomQualityModeSettings["data-saver"]).toEqual({ receive: "360p", send: "360p" });
  });
});

describe("domain contracts", () => {
  it("keeps identifiers nominally distinct", () => {
    expectTypeOf<OrganizationId>().not.toEqualTypeOf<ProjectId>();
    expectTypeOf<ProjectId>().not.toEqualTypeOf<EnvironmentId>();
  });

  it("uses scoped identifiers on project resources", () => {
    expectTypeOf<Organization["id"]>().toEqualTypeOf<OrganizationId>();
    expectTypeOf<Room["environmentId"]>().toEqualTypeOf<EnvironmentId>();
    expectTypeOf<ApiKey["environmentId"]>().toEqualTypeOf<EnvironmentId>();
    expectTypeOf<WebhookEndpoint["environmentId"]>().toEqualTypeOf<EnvironmentId>();
  });

  it("includes the mandatory MVP usage dimensions", () => {
    expectTypeOf<UsageMetrics>().toHaveProperty("participantSeconds");
    expectTypeOf<UsageMetrics>().toHaveProperty("sfuEgressBytes");
    expectTypeOf<UsageMetrics>().toHaveProperty("turnRelaySeconds");
    expectTypeOf<UsageMetrics>().toHaveProperty("signalingConnectionSeconds");
    expectTypeOf<UsageMetrics>().toHaveProperty("peakConcurrentParticipants");
  });
});
