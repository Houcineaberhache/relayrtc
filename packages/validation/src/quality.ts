import { connectionQualities, type ConnectionQualityEvent } from "@relayrtc/types";
import { z } from "zod";

import { isoDateTimeSchema, participantIdSchema, roomIdSchema } from "./common.js";

export const connectionQualitySchema = z.enum(connectionQualities);

export const connectionQualityEventSchema: z.ZodType<ConnectionQualityEvent> = z
  .object({
    occurredAt: isoDateTimeSchema,
    participantId: participantIdSchema,
    previousQuality: connectionQualitySchema,
    quality: connectionQualitySchema,
    roomId: roomIdSchema,
  })
  .strict();
