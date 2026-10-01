import {
  webhookDeliveryStatuses,
  webhookEndpointStatuses,
  webhookEventTypes,
  type StoredWebhookEndpoint,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from "@relaykit/types";
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
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
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
    hashedSigningSecret: z.string().min(32).max(512),
  })
  .strict();

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
