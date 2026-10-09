import {
  usageEventTypes,
  usageGranularities,
  canonicalUsageMetric,
  usageMetricDefinitions,
  type UsageDimensions,
  type UsageEvent,
  type UsageMetrics,
  type UsageRecord,
} from "@relayrtc/types";
import { z } from "zod";

import {
  environmentIdSchema,
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  nonNegativeNumberSchema,
  organizationIdSchema,
  projectIdSchema,
  roomIdSchema,
  usageEventIdSchema,
  usageRecordIdSchema,
} from "./common.js";

export const usageGranularitySchema = z.enum(usageGranularities);
export const usageEventTypeSchema = z.enum(usageEventTypes);

export function usageMetricValueSchema(name: string) {
  return usageMetricDefinitions[canonicalUsageMetric(name)].integer
    ? nonNegativeIntegerSchema
    : nonNegativeNumberSchema;
}

export const usageDimensionsSchema: z.ZodType<UsageDimensions> = z
  .object({
    organizationId: organizationIdSchema,
    projectId: projectIdSchema,
    environmentId: environmentIdSchema,
    roomId: roomIdSchema.nullable(),
    region: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const usageMetricsSchema: z.ZodType<UsageMetrics> = z
  .object({
    participantSeconds: usageMetricValueSchema("participantSeconds"),
    participantMinutesDerived: usageMetricValueSchema("participantMinutesDerived"),
    audioParticipantSeconds: usageMetricValueSchema("audioParticipantSeconds"),
    videoParticipantSeconds: usageMetricValueSchema("videoParticipantSeconds"),
    sfuIngressBytes: usageMetricValueSchema("sfuIngressBytes"),
    sfuEgressBytes: usageMetricValueSchema("sfuEgressBytes"),
    turnIngressBytes: usageMetricValueSchema("turnIngressBytes"),
    turnEgressBytes: usageMetricValueSchema("turnEgressBytes"),
    turnRelaySeconds: usageMetricValueSchema("turnRelaySeconds"),
    turnSessions: usageMetricValueSchema("turnSessions"),
    signalingConnections: usageMetricValueSchema("signalingConnections"),
    signalingConnectionSeconds: usageMetricValueSchema("signalingConnectionSeconds"),
    signalingMessagesIn: usageMetricValueSchema("signalingMessagesIn"),
    signalingMessagesOut: usageMetricValueSchema("signalingMessagesOut"),
    roomsCreated: usageMetricValueSchema("roomsCreated"),
    roomsStarted: usageMetricValueSchema("roomsStarted"),
    roomSeconds: usageMetricValueSchema("roomSeconds"),
    peakConcurrentRooms: usageMetricValueSchema("peakConcurrentRooms"),
    peakConcurrentParticipants: usageMetricValueSchema("peakConcurrentParticipants"),
    averageConcurrentParticipants: usageMetricValueSchema("averageConcurrentParticipants"),
    screenShareSeconds: usageMetricValueSchema("screenShareSeconds"),
    screenShareIngressBytes: usageMetricValueSchema("screenShareIngressBytes"),
    screenShareEgressBytes: usageMetricValueSchema("screenShareEgressBytes"),
  })
  .strict()
  .refine(
    (metrics) =>
      Math.abs(metrics.participantMinutesDerived - metrics.participantSeconds / 60) <=
      Number.EPSILON *
        Math.max(1, metrics.participantMinutesDerived, metrics.participantSeconds / 60) *
        8,
    {
      message: "Participant minutes must equal participant seconds divided by 60",
      path: ["participantMinutesDerived"],
    },
  );

export const usageEventSchema: z.ZodType<UsageEvent> = z
  .object({
    id: usageEventIdSchema,
    type: usageEventTypeSchema,
    dimensions: usageDimensionsSchema,
    value: nonNegativeNumberSchema,
    occurredAt: isoDateTimeSchema,
  })
  .strict();

export const usageRecordSchema: z.ZodType<UsageRecord> = z
  .object({
    id: usageRecordIdSchema,
    dimensions: usageDimensionsSchema,
    granularity: usageGranularitySchema,
    windowStartedAt: isoDateTimeSchema,
    windowEndedAt: isoDateTimeSchema,
    metrics: usageMetricsSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .refine((value) => Date.parse(value.windowEndedAt) > Date.parse(value.windowStartedAt), {
    message: "Usage windows must have positive duration",
    path: ["windowEndedAt"],
  });
