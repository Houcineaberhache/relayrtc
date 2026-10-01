import { trackPriorities, trackStates, trackTypes, type Track } from "@relaykit/types";
import { z } from "zod";

import {
  isoDateTimeSchema,
  metadataSchema,
  participantIdSchema,
  roomIdSchema,
  sessionIdSchema,
  trackIdSchema,
} from "./common.js";

export const trackTypeSchema = z.enum(trackTypes);
export const trackStateSchema = z.enum(trackStates);
export const trackPrioritySchema = z.enum(trackPriorities);

export const trackSchema: z.ZodType<Track> = z
  .object({
    id: trackIdSchema,
    roomId: roomIdSchema,
    participantId: participantIdSchema,
    sessionId: sessionIdSchema,
    type: trackTypeSchema,
    state: trackStateSchema,
    priority: trackPrioritySchema,
    metadata: metadataSchema,
    publishedAt: isoDateTimeSchema,
    unpublishedAt: isoDateTimeSchema.nullable(),
  })
  .strict();
