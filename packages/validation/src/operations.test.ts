import type {
  ApiKey,
  StoredApiKey,
  UsageEvent,
  UsageRecord,
  WebhookDelivery,
  WebhookEndpoint,
} from "@relayrtc/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  apiKeySchema,
  createApiKeyInputSchema,
  revokeApiKeyInputSchema,
  rotateApiKeyInputSchema,
  storedApiKeySchema,
} from "./api-key.js";
import { usageEventSchema, usageRecordSchema } from "./usage.js";
import { webhookDeliverySchema, webhookEndpointSchema } from "./webhook.js";

const timestamp = "2026-10-01T00:00:00Z";

const secretApiKey = {
  id: "key_123",
  projectId: "project_123",
  environmentId: "environment_123",
  name: "Production backend",
  type: "secret",
  prefix: "rk_sk_live_1234",
  scopes: ["rooms:create", "tokens:create"],
  createdAt: timestamp,
  lastUsedAt: null,
  expiresAt: "2027-10-01T00:00:00Z",
  revokedAt: null,
  createdBy: "user_123",
};

const webhookEndpoint = {
  id: "webhook_123",
  projectId: "project_123",
  environmentId: "environment_123",
  url: "https://example.com/relayrtc/events",
  eventTypes: ["room.started", "participant.joined"],
  status: "enabled",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const usageDimensions = {
  organizationId: "org_123",
  projectId: "project_123",
  environmentId: "environment_123",
  roomId: "room_123",
  region: "eu-west",
};

const usageMetrics = {
  participantSeconds: 120,
  participantMinutesDerived: 2,
  audioParticipantSeconds: 120,
  videoParticipantSeconds: 60,
  sfuIngressBytes: 1_000,
  sfuEgressBytes: 2_000,
  turnIngressBytes: 0,
  turnEgressBytes: 0,
  turnRelaySeconds: 0,
  turnSessions: 0,
  signalingConnections: 2,
  signalingConnectionSeconds: 120,
  signalingMessagesIn: 20,
  signalingMessagesOut: 24,
  roomsCreated: 1,
  roomsStarted: 1,
  roomSeconds: 60,
  peakConcurrentRooms: 1,
  peakConcurrentParticipants: 2,
  averageConcurrentParticipants: 1.5,
  screenShareSeconds: 0,
  screenShareIngressBytes: 0,
  screenShareEgressBytes: 0,
};

describe("API key schemas", () => {
  it("validates environment-scoped key operations", () => {
    expect(
      createApiKeyInputSchema.parse({
        projectId: "project_123",
        environmentId: "environment_123",
        name: "Production backend",
        type: "secret",
        scopes: ["rooms:create", "tokens:create"],
        expiresAt: "2027-10-01T00:00:00Z",
      }),
    ).toMatchObject({
      projectId: "project_123",
      environmentId: "environment_123",
      type: "secret",
    });
    expect(
      createApiKeyInputSchema.safeParse({
        projectId: "project_123",
        environmentId: "environment_123",
        name: "Browser",
        type: "publishable",
        scopes: ["rooms:create"],
        expiresAt: null,
      }).success,
    ).toBe(false);
    expect(
      rotateApiKeyInputSchema.safeParse({
        apiKeyId: "key_123",
        projectId: "project_123",
      }).success,
    ).toBe(true);
    expect(
      revokeApiKeyInputSchema.safeParse({
        apiKeyId: "key_123",
        projectId: "project_123",
      }).success,
    ).toBe(true);
  });

  it("parses public and stored API key contracts", () => {
    const apiKey = apiKeySchema.parse(secretApiKey);
    const storedApiKey = storedApiKeySchema.parse({
      ...secretApiKey,
      hashedSecret: "a".repeat(64),
    });

    expectTypeOf(apiKey).toEqualTypeOf<ApiKey>();
    expectTypeOf(storedApiKey).toEqualTypeOf<StoredApiKey>();
  });

  it("rejects privileged publishable keys and duplicate scopes", () => {
    expect(apiKeySchema.safeParse({ ...secretApiKey, type: "publishable" }).success).toBe(false);
    expect(
      apiKeySchema.safeParse({
        ...secretApiKey,
        scopes: ["rooms:create", "rooms:create"],
      }).success,
    ).toBe(false);
  });

  it("rejects expiration before creation", () => {
    expect(
      apiKeySchema.safeParse({
        ...secretApiKey,
        expiresAt: "2025-10-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("webhook schemas", () => {
  it("parses webhook endpoints and deliveries", () => {
    const endpoint = webhookEndpointSchema.parse(webhookEndpoint);
    const delivery = webhookDeliverySchema.parse({
      id: "delivery_123",
      endpointId: "webhook_123",
      event: {
        id: "event_123",
        type: "room.started",
        projectId: "project_123",
        environmentId: "environment_123",
        occurredAt: timestamp,
        data: { roomId: "room_123" },
      },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: timestamp,
      deliveredAt: null,
      createdAt: timestamp,
    });

    expectTypeOf(endpoint).toEqualTypeOf<WebhookEndpoint>();
    expectTypeOf(delivery).toEqualTypeOf<WebhookDelivery>();
  });

  it("rejects unsafe schemes and duplicate subscriptions", () => {
    expect(
      webhookEndpointSchema.safeParse({ ...webhookEndpoint, url: "file:///tmp/events" }).success,
    ).toBe(false);
    expect(
      webhookEndpointSchema.safeParse({
        ...webhookEndpoint,
        eventTypes: ["room.started", "room.started"],
      }).success,
    ).toBe(false);
  });
});

describe("usage schemas", () => {
  it("parses usage events and aggregate records", () => {
    const usageEvent = usageEventSchema.parse({
      id: "usage_event_123",
      type: "sfu.bytes.egress",
      dimensions: usageDimensions,
      value: 2_000,
      occurredAt: timestamp,
    });
    const usageRecord = usageRecordSchema.parse({
      id: "usage_record_123",
      dimensions: usageDimensions,
      granularity: "hour",
      windowStartedAt: timestamp,
      windowEndedAt: "2026-10-01T01:00:00Z",
      metrics: usageMetrics,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expectTypeOf(usageEvent).toEqualTypeOf<UsageEvent>();
    expectTypeOf(usageRecord).toEqualTypeOf<UsageRecord>();
  });

  it("rejects negative counters and inverted aggregation windows", () => {
    expect(
      usageEventSchema.safeParse({
        id: "usage_event_123",
        type: "sfu.bytes.egress",
        dimensions: usageDimensions,
        value: -1,
        occurredAt: timestamp,
      }).success,
    ).toBe(false);
    expect(
      usageRecordSchema.safeParse({
        id: "usage_record_123",
        dimensions: usageDimensions,
        granularity: "hour",
        windowStartedAt: "2026-10-01T02:00:00Z",
        windowEndedAt: "2026-10-01T01:00:00Z",
        metrics: usageMetrics,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
    ).toBe(false);
  });
});
