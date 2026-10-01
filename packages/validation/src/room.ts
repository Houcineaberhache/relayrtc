import { roomStatuses, type Room } from "@relayrtc/types";
import { z } from "zod";

import {
  environmentIdSchema,
  isoDateTimeSchema,
  metadataSchema,
  nameSchema,
  projectIdSchema,
  roomIdSchema,
} from "./common.js";

export const roomStatusSchema = z.enum(roomStatuses);

export const roomSchema: z.ZodType<Room> = z
  .object({
    id: roomIdSchema,
    projectId: projectIdSchema,
    environmentId: environmentIdSchema,
    name: nameSchema,
    metadata: metadataSchema,
    status: roomStatusSchema,
    maxParticipants: z.number().int().positive().max(100_000),
    createdAt: isoDateTimeSchema,
    startedAt: isoDateTimeSchema.nullable(),
    endedAt: isoDateTimeSchema.nullable(),
  })
  .strict();
