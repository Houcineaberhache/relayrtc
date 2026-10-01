import type {
  IsoDateTime,
  Participant,
  ParticipantId,
  ParticipantSession,
  Room,
  RoomId,
  SessionId,
  Track,
} from "@relaykit/types";
import {
  isoDateTimeSchema,
  participantIdSchema,
  participantSchema,
  participantSessionSchema,
  roomIdSchema,
  roomSchema,
  sessionIdSchema,
  trackSchema,
} from "@relaykit/validation";
import { z } from "zod";

import type { ProtocolEvent, ProtocolRequest, ProtocolResponse } from "./envelope.js";
import { protocolEventSchema, protocolRequestSchema, protocolResponseSchema } from "./envelope.js";

export interface ParticipantJoinRequestPayload {
  readonly roomId: RoomId;
  readonly participantToken: string;
}

export interface ParticipantJoinAcceptedPayload {
  readonly room: Room;
  readonly localParticipant: Participant;
  readonly session: ParticipantSession;
  readonly participants: readonly Participant[];
  readonly tracks: readonly Track[];
}

export interface ParticipantLeaveRequestPayload {
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly sessionId: SessionId;
}

export interface ParticipantLeaveAcceptedPayload extends ParticipantLeaveRequestPayload {
  readonly leftAt: IsoDateTime;
}

export interface ParticipantJoinedEventPayload {
  readonly participant: Participant;
}

export interface ParticipantLeftEventPayload {
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly sessionId: SessionId;
  readonly leftAt: IsoDateTime;
}

export interface ParticipantReconnectedEventPayload {
  readonly participantId: ParticipantId;
  readonly session: ParticipantSession;
}

export type ParticipantJoinRequest = ProtocolRequest<
  "participant.join",
  ParticipantJoinRequestPayload
>;
export type ParticipantJoinAcceptedResponse = ProtocolResponse<
  "participant.join.accepted",
  ParticipantJoinAcceptedPayload
>;
export type ParticipantLeaveRequest = ProtocolRequest<
  "participant.leave",
  ParticipantLeaveRequestPayload
>;
export type ParticipantLeaveAcceptedResponse = ProtocolResponse<
  "participant.leave.accepted",
  ParticipantLeaveAcceptedPayload
>;
export type ParticipantJoinedEvent = ProtocolEvent<
  "participant.joined",
  ParticipantJoinedEventPayload
>;
export type ParticipantLeftEvent = ProtocolEvent<"participant.left", ParticipantLeftEventPayload>;
export type ParticipantReconnectedEvent = ProtocolEvent<
  "participant.reconnected",
  ParticipantReconnectedEventPayload
>;

const participantJoinRequestPayloadSchema = z
  .object({
    roomId: roomIdSchema,
    participantToken: z.string().min(1).max(8_192),
  })
  .strict();

const participantJoinAcceptedPayloadSchema = z
  .object({
    room: roomSchema,
    localParticipant: participantSchema,
    session: participantSessionSchema,
    participants: z.array(participantSchema).readonly(),
    tracks: z.array(trackSchema).readonly(),
  })
  .strict();

const participantLeaveRequestPayloadSchema = z
  .object({
    roomId: roomIdSchema,
    participantId: participantIdSchema,
    sessionId: sessionIdSchema,
  })
  .strict();

const participantLeaveAcceptedPayloadSchema = z
  .object({
    roomId: roomIdSchema,
    participantId: participantIdSchema,
    sessionId: sessionIdSchema,
    leftAt: isoDateTimeSchema,
  })
  .strict();

export const participantJoinRequestSchema = protocolRequestSchema(
  "participant.join",
  participantJoinRequestPayloadSchema,
) satisfies z.ZodType<ParticipantJoinRequest>;

export const participantJoinAcceptedResponseSchema = protocolResponseSchema(
  "participant.join.accepted",
  participantJoinAcceptedPayloadSchema,
) satisfies z.ZodType<ParticipantJoinAcceptedResponse>;

export const participantLeaveRequestSchema = protocolRequestSchema(
  "participant.leave",
  participantLeaveRequestPayloadSchema,
) satisfies z.ZodType<ParticipantLeaveRequest>;

export const participantLeaveAcceptedResponseSchema = protocolResponseSchema(
  "participant.leave.accepted",
  participantLeaveAcceptedPayloadSchema,
) satisfies z.ZodType<ParticipantLeaveAcceptedResponse>;

export const participantJoinedEventSchema = protocolEventSchema(
  "participant.joined",
  z.object({ participant: participantSchema }).strict(),
) satisfies z.ZodType<ParticipantJoinedEvent>;

export const participantLeftEventSchema = protocolEventSchema(
  "participant.left",
  z
    .object({
      roomId: roomIdSchema,
      participantId: participantIdSchema,
      sessionId: sessionIdSchema,
      leftAt: isoDateTimeSchema,
    })
    .strict(),
) satisfies z.ZodType<ParticipantLeftEvent>;

export const participantReconnectedEventSchema = protocolEventSchema(
  "participant.reconnected",
  z
    .object({
      participantId: participantIdSchema,
      session: participantSessionSchema.refine(
        (session) => session.connectionState === "connected" && session.reconnectedAt !== null,
        {
          message: "Reconnected participant events require a connected session and timestamp",
        },
      ),
    })
    .strict(),
) satisfies z.ZodType<ParticipantReconnectedEvent>;
