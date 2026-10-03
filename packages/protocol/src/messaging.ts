import type { JsonValue, ParticipantId, RoomId, SessionId } from "@relayrtc/types";
import {
  jsonValueSchema,
  participantIdSchema,
  roomIdSchema,
  sessionIdSchema,
} from "@relayrtc/validation";
import { z } from "zod";

import type {
  ProtocolEvent,
  ProtocolMessageId,
  ProtocolRequest,
  ProtocolResponse,
} from "./envelope.js";
import {
  protocolEventSchema,
  protocolMessageIdSchema,
  protocolRequestSchema,
  protocolResponseSchema,
} from "./envelope.js";

interface MessagingScope {
  readonly roomId: RoomId;
  readonly sessionId: SessionId;
}

export interface TextMessageSendPayload extends MessagingScope {
  readonly text: string;
}

export interface CustomEventEmitPayload extends MessagingScope {
  readonly name: string;
  readonly data: JsonValue;
}

export interface TextMessagePayload {
  readonly messageId: ProtocolMessageId;
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly text: string;
}

export interface CustomEventPayload {
  readonly messageId: ProtocolMessageId;
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly name: string;
  readonly data: JsonValue;
}

export type TextMessageSendRequest = ProtocolRequest<"message.send", TextMessageSendPayload>;
export type TextMessageSentResponse = ProtocolResponse<"message.sent", TextMessagePayload>;
export type TextMessageReceivedEvent = ProtocolEvent<"message.received", TextMessagePayload>;
export type CustomEventEmitRequest = ProtocolRequest<"event.emit", CustomEventEmitPayload>;
export type CustomEventEmittedResponse = ProtocolResponse<"event.emitted", CustomEventPayload>;
export type CustomEventReceivedEvent = ProtocolEvent<"event.received", CustomEventPayload>;

const messagingScopeSchema = {
  roomId: roomIdSchema,
  sessionId: sessionIdSchema,
};
const textSchema = z
  .string()
  .min(1)
  .max(4_000)
  .refine((value) => value.trim().length > 0, { message: "Text messages cannot be blank" });
const eventNameSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u);
const deliveredMessageSchema = {
  messageId: protocolMessageIdSchema,
  roomId: roomIdSchema,
  participantId: participantIdSchema,
};

export const textMessageSendRequestSchema = protocolRequestSchema(
  "message.send",
  z.object({ ...messagingScopeSchema, text: textSchema }).strict(),
) satisfies z.ZodType<TextMessageSendRequest>;

const textMessagePayloadSchema = z
  .object({ ...deliveredMessageSchema, text: textSchema })
  .strict();

export const textMessageSentResponseSchema = protocolResponseSchema(
  "message.sent",
  textMessagePayloadSchema,
) satisfies z.ZodType<TextMessageSentResponse>;

export const textMessageReceivedEventSchema = protocolEventSchema(
  "message.received",
  textMessagePayloadSchema,
) satisfies z.ZodType<TextMessageReceivedEvent>;

export const customEventEmitRequestSchema = protocolRequestSchema(
  "event.emit",
  z.object({ ...messagingScopeSchema, name: eventNameSchema, data: jsonValueSchema }).strict(),
) satisfies z.ZodType<CustomEventEmitRequest>;

const customEventPayloadSchema = z
  .object({ ...deliveredMessageSchema, name: eventNameSchema, data: jsonValueSchema })
  .strict();

export const customEventEmittedResponseSchema = protocolResponseSchema(
  "event.emitted",
  customEventPayloadSchema,
) satisfies z.ZodType<CustomEventEmittedResponse>;

export const customEventReceivedEventSchema = protocolEventSchema(
  "event.received",
  customEventPayloadSchema,
) satisfies z.ZodType<CustomEventReceivedEvent>;
