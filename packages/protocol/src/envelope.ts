import type { Brand, IsoDateTime } from "@relayrtc/types";
import { isoDateTimeSchema } from "@relayrtc/validation";
import { z } from "zod";

import type { ProtocolVersion } from "./version.js";
import { protocolVersionSchema } from "./version.js";

export type ProtocolMessageId = Brand<string, "ProtocolMessageId">;

export interface ProtocolEnvelope<Type extends string, Payload> {
  readonly v: ProtocolVersion;
  readonly id: ProtocolMessageId;
  readonly sentAt: IsoDateTime;
  readonly type: Type;
  readonly payload: Payload;
}

export type ProtocolRequest<Type extends string, Payload> = ProtocolEnvelope<Type, Payload>;

export interface ProtocolResponse<Type extends string, Payload> extends ProtocolEnvelope<
  Type,
  Payload
> {
  readonly requestId: ProtocolMessageId;
}

export type ProtocolEvent<Type extends string, Payload> = ProtocolEnvelope<Type, Payload>;

export interface CorrelatedProtocolEvent<Type extends string, Payload> extends ProtocolEvent<
  Type,
  Payload
> {
  readonly requestId?: ProtocolMessageId | undefined;
}

export const protocolMessageIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^\S+$/u)
  .transform((value) => value as ProtocolMessageId);

const envelopeShape = {
  v: protocolVersionSchema,
  id: protocolMessageIdSchema,
  sentAt: isoDateTimeSchema,
};

export function protocolRequestSchema<Type extends string, PayloadSchema extends z.ZodType>(
  type: Type,
  payload: PayloadSchema,
) {
  return z
    .object({
      ...envelopeShape,
      type: z.literal(type),
      payload,
    })
    .strict();
}

export function protocolResponseSchema<Type extends string, PayloadSchema extends z.ZodType>(
  type: Type,
  payload: PayloadSchema,
) {
  return z
    .object({
      ...envelopeShape,
      requestId: protocolMessageIdSchema,
      type: z.literal(type),
      payload,
    })
    .strict();
}

export function protocolEventSchema<Type extends string, PayloadSchema extends z.ZodType>(
  type: Type,
  payload: PayloadSchema,
) {
  return protocolRequestSchema(type, payload);
}

export function correlatedProtocolEventSchema<Type extends string, PayloadSchema extends z.ZodType>(
  type: Type,
  payload: PayloadSchema,
) {
  return protocolEventSchema(type, payload).extend({
    requestId: protocolMessageIdSchema.optional(),
  });
}
