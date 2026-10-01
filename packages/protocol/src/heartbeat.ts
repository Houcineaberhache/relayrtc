import type { IsoDateTime } from "@relaykit/types";
import { isoDateTimeSchema } from "@relaykit/validation";
import { z } from "zod";

import type { ProtocolRequest, ProtocolResponse } from "./envelope.js";
import { protocolRequestSchema, protocolResponseSchema } from "./envelope.js";

export interface HeartbeatPayload {
  readonly nonce: string;
}

export interface HeartbeatPongPayload extends HeartbeatPayload {
  readonly serverTime: IsoDateTime;
}

export type HeartbeatPingRequest = ProtocolRequest<"heartbeat.ping", HeartbeatPayload>;
export type HeartbeatPongResponse = ProtocolResponse<"heartbeat.pong", HeartbeatPongPayload>;

const heartbeatPayloadSchema = z
  .object({
    nonce: z.string().min(1).max(128),
  })
  .strict();

const heartbeatPongPayloadSchema = z
  .object({
    nonce: z.string().min(1).max(128),
    serverTime: isoDateTimeSchema,
  })
  .strict();

export const heartbeatPingRequestSchema = protocolRequestSchema(
  "heartbeat.ping",
  heartbeatPayloadSchema,
) satisfies z.ZodType<HeartbeatPingRequest>;

export const heartbeatPongResponseSchema = protocolResponseSchema(
  "heartbeat.pong",
  heartbeatPongPayloadSchema,
) satisfies z.ZodType<HeartbeatPongResponse>;
