import type { JsonObject } from "@relaykit/types";
import { isoDateTimeSchema, metadataSchema } from "@relaykit/validation";
import { z } from "zod";

import type { ProtocolEnvelope, ProtocolMessageId } from "./envelope.js";
import { protocolMessageIdSchema } from "./envelope.js";
import { protocolVersionSchema } from "./version.js";

export const protocolErrorCodes = [
  "invalid_message",
  "unsupported_version",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
  "temporarily_unavailable",
] as const;

export type ProtocolErrorCode = (typeof protocolErrorCodes)[number];

export interface ProtocolErrorPayload {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details: JsonObject;
}

export interface ProtocolErrorMessage extends ProtocolEnvelope<
  "protocol.error",
  ProtocolErrorPayload
> {
  readonly requestId: ProtocolMessageId | null;
}

export const protocolErrorCodeSchema = z.enum(protocolErrorCodes);

export const protocolErrorMessageSchema = z
  .object({
    v: protocolVersionSchema,
    id: protocolMessageIdSchema,
    requestId: protocolMessageIdSchema.nullable(),
    sentAt: isoDateTimeSchema,
    type: z.literal("protocol.error"),
    payload: z
      .object({
        code: protocolErrorCodeSchema,
        message: z.string().min(1).max(1_000),
        retryable: z.boolean(),
        details: metadataSchema,
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<ProtocolErrorMessage>;
