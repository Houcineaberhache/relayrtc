import {
  connectionStates,
  transportTypes,
  type Participant,
  type ParticipantSession,
} from "@relayrtc/types";
import { z } from "zod";

import {
  isoDateTimeSchema,
  metadataSchema,
  nameSchema,
  participantIdSchema,
  roomIdSchema,
  sessionIdSchema,
} from "./common.js";

export const connectionStateSchema = z.enum(connectionStates);
export const transportTypeSchema = z.enum(transportTypes);

export const participantSchema: z.ZodType<Participant> = z
  .object({
    id: participantIdSchema,
    roomId: roomIdSchema,
    externalId: z.string().min(1).max(255).nullable(),
    name: nameSchema,
    metadata: metadataSchema,
    role: z.string().min(1).max(80),
    joinedAt: isoDateTimeSchema,
    leftAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const participantSessionSchema: z.ZodType<ParticipantSession> = z
  .object({
    id: sessionIdSchema,
    participantId: participantIdSchema,
    signalingNodeId: z.string().min(1).max(128),
    mediaNodeId: z.string().min(1).max(128).nullable(),
    connectionState: connectionStateSchema,
    transportType: transportTypeSchema,
    joinedAt: isoDateTimeSchema,
    disconnectedAt: isoDateTimeSchema.nullable(),
    reconnectedAt: isoDateTimeSchema.nullable(),
  })
  .strict();
