import type { Participant, ParticipantSession, RoomId, SessionId, Track } from "@relayrtc/types";
import {
  participantSchema,
  participantSessionSchema,
  roomIdSchema,
  sessionIdSchema,
  trackSchema,
} from "@relayrtc/validation";
import { z } from "zod";

import type { ProtocolRequest, ProtocolResponse } from "./envelope.js";
import { protocolRequestSchema, protocolResponseSchema } from "./envelope.js";

export interface SessionResumeRequestPayload {
  readonly roomId: RoomId;
  readonly sessionId: SessionId;
  readonly resumeToken: string;
}

export interface SessionResumeAcceptedPayload {
  readonly roomId: RoomId;
  readonly session: ParticipantSession;
  readonly participants: readonly Participant[];
  readonly tracks: readonly Track[];
}

export type SessionResumeRequest = ProtocolRequest<"session.resume", SessionResumeRequestPayload>;
export type SessionResumeAcceptedResponse = ProtocolResponse<
  "session.resume.accepted",
  SessionResumeAcceptedPayload
>;

export const sessionResumeRequestSchema = protocolRequestSchema(
  "session.resume",
  z
    .object({
      roomId: roomIdSchema,
      sessionId: sessionIdSchema,
      resumeToken: z.string().min(1).max(8_192),
    })
    .strict(),
) satisfies z.ZodType<SessionResumeRequest>;

export const sessionResumeAcceptedResponseSchema = protocolResponseSchema(
  "session.resume.accepted",
  z
    .object({
      roomId: roomIdSchema,
      session: participantSessionSchema,
      participants: z.array(participantSchema).readonly(),
      tracks: z.array(trackSchema).readonly(),
    })
    .strict(),
) satisfies z.ZodType<SessionResumeAcceptedResponse>;
