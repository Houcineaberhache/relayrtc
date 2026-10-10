import {
  webhookDeliveryStatuses,
  webhookDeliveryAttemptStatuses,
  webhookEndpointStatuses,
  webhookEventTypes,
  type StoredWebhookEndpoint,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from "@relayrtc/types";
import { z } from "zod";

import {
  environmentIdSchema,
  isoDateTimeSchema,
  metadataSchema,
  nonNegativeIntegerSchema,
  projectIdSchema,
  webhookDeliveryIdSchema,
  webhookEndpointIdSchema,
  webhookEventIdSchema,
} from "./common.js";

export const webhookEventTypeSchema = z.enum(webhookEventTypes);
export const webhookEndpointStatusSchema = z.enum(webhookEndpointStatuses);
export const webhookDeliveryStatusSchema = z.enum(webhookDeliveryStatuses);

export const webhookUrlSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.hash &&
      value.length <= 2048
    );
  },
  { message: "Webhook URL must use HTTP or HTTPS" },
);

const webhookEndpointShape = {
  id: webhookEndpointIdSchema,
  projectId: projectIdSchema,
  environmentId: environmentIdSchema,
  url: webhookUrlSchema,
  eventTypes: z
    .array(webhookEventTypeSchema)
    .min(1)
    .max(webhookEventTypes.length)
    .refine((values) => new Set(values).size === values.length, {
      message: "Webhook event types must be unique",
    }),
  status: webhookEndpointStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
};

export const webhookEndpointSchema: z.ZodType<WebhookEndpoint> = z
  .object(webhookEndpointShape)
  .strict();

export const storedWebhookEndpointSchema: z.ZodType<StoredWebhookEndpoint> = z
  .object({
    ...webhookEndpointShape,
    encryptedSigningSecret: z.string().min(32).max(512),
    signingSecretVersion: z.number().int().positive(),
  })
  .strict();

export const createWebhookInputSchema = z
  .object({
    url: webhookUrlSchema,
    eventTypes: webhookEndpointShape.eventTypes,
    status: webhookEndpointStatusSchema.default("enabled"),
  })
  .strict();
export const updateWebhookInputSchema = z
  .object({
    url: webhookUrlSchema.optional(),
    eventTypes: webhookEndpointShape.eventTypes.optional(),
    status: webhookEndpointStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide a configuration change" });
export const webhookParamsSchema = z.object({ endpointId: webhookEndpointIdSchema }).strict();
export const webhookScopeQuerySchema = z
  .object({ projectId: projectIdSchema.optional(), environmentId: environmentIdSchema.optional() })
  .strict();
export const listWebhookQuerySchema = webhookScopeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const webhookConfigurationSchema = z
  .object({
    ...webhookEndpointShape,
    signingSecretVersion: z.number().int().positive(),
    signingSecretRotatedAt: isoDateTimeSchema,
  })
  .strict();
export const revealedWebhookConfigurationSchema = webhookConfigurationSchema.extend({
  signingSecret: z.string().regex(/^whsec_[A-Za-z0-9_-]{43}$/u),
  rotationPolicy: z.literal("immediate replacement"),
});
export const webhookConfigurationListSchema = z
  .object({
    endpoints: z.array(webhookConfigurationSchema),
    pagination: z
      .object({
        limit: z.number().int().positive(),
        offset: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type CreateWebhookInput = z.infer<typeof createWebhookInputSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookInputSchema>;

export const listWebhookDeliveriesQuerySchema = listWebhookQuerySchema.extend({
  status: webhookDeliveryStatusSchema.optional(),
});
export const replayWebhookDeliveryInputSchema = z.object({
  expectedReplayCount: z.number().int().min(0).max(99),
}).strict();
export const webhookDeliveryRecordSchema = z.object({
  id: webhookDeliveryIdSchema,
  endpointId: webhookEndpointIdSchema,
  eventId: webhookEventIdSchema,
  projectId: projectIdSchema,
  environmentId: environmentIdSchema,
  url: webhookUrlSchema,
  status: webhookDeliveryStatusSchema,
  attemptCount: nonNegativeIntegerSchema,
  runAttemptCount: z.number().int().min(0).max(8),
  replayCount: z.number().int().min(0).max(100),
  lastError: z.string().nullable(),
  nextAttemptAt: isoDateTimeSchema.nullable(),
  deliveredAt: isoDateTimeSchema.nullable(),
  runStartedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();
export const webhookDeliveryAttemptSchema = z.object({
  id: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  replayCount: z.number().int().min(0).max(100),
  status: z.enum(webhookDeliveryAttemptStatuses),
  signingSecretVersion: z.number().int().positive(),
  signatureTimestamp: z.number().int().positive(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  errorCode: z.string().nullable(),
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
}).strict();
export const webhookDeliveryListSchema = z.object({
  deliveries: z.array(webhookDeliveryRecordSchema).max(100),
  pagination: z.object({ limit: z.number().int().positive(), offset: nonNegativeIntegerSchema, total: nonNegativeIntegerSchema }).strict(),
}).strict();

export const webhookEventSchema: z.ZodType<WebhookEvent> = z
  .object({
    id: webhookEventIdSchema,
    type: webhookEventTypeSchema,
    projectId: projectIdSchema,
    environmentId: environmentIdSchema,
    occurredAt: isoDateTimeSchema,
    data: metadataSchema,
  })
  .strict();

export const webhookDeliverySchema: z.ZodType<WebhookDelivery> = z
  .object({
    id: webhookDeliveryIdSchema,
    endpointId: webhookEndpointIdSchema,
    event: webhookEventSchema,
    status: webhookDeliveryStatusSchema,
    attemptCount: nonNegativeIntegerSchema,
    nextAttemptAt: isoDateTimeSchema.nullable(),
    deliveredAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const webhookDeliveryDetailSchema = webhookDeliveryRecordSchema.extend({
  event: webhookEventSchema,
  rawBody: z.string().max(1_048_576),
  attempts: z.array(webhookDeliveryAttemptSchema).max(808),
});
