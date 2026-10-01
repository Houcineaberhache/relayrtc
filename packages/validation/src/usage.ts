import {
  usageEventTypes,
  usageGranularities,
  type UsageDimensions,
  type UsageEvent,
  type UsageMetrics,
  type UsageRecord,
} from "@relaykit/types";
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
    participantSeconds: nonNegativeIntegerSchema,
    participantMinutesDerived: nonNegativeNumberSchema,
    audioParticipantSeconds: nonNegativeIntegerSchema,
    videoParticipantSeconds: nonNegativeIntegerSchema,
    sfuIngressBytes: nonNegativeIntegerSchema,
    sfuEgressBytes: nonNegativeIntegerSchema,
    turnIngressBytes: nonNegativeIntegerSchema,
    turnEgressBytes: nonNegativeIntegerSchema,
    turnRelaySeconds: nonNegativeIntegerSchema,
    turnSessions: nonNegativeIntegerSchema,
    signalingConnections: nonNegativeIntegerSchema,
    signalingConnectionSeconds: nonNegativeIntegerSchema,
    signalingMessagesIn: nonNegativeIntegerSchema,
    signalingMessagesOut: nonNegativeIntegerSchema,
    roomsCreated: nonNegativeIntegerSchema,
    roomsStarted: nonNegativeIntegerSchema,
    roomSeconds: nonNegativeIntegerSchema,
    peakConcurrentRooms: nonNegativeIntegerSchema,
    peakConcurrentParticipants: nonNegativeIntegerSchema,
    averageConcurrentParticipants: nonNegativeNumberSchema,
    screenShareSeconds: nonNegativeIntegerSchema,
    screenShareIngressBytes: nonNegativeIntegerSchema,
    screenShareEgressBytes: nonNegativeIntegerSchema,
  })
  .strict();

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
  .refine((value) => Date.parse(value.windowEndedAt) >= Date.parse(value.windowStartedAt), {
    message: "windowEndedAt must not precede windowStartedAt",
    path: ["windowEndedAt"],
  });
