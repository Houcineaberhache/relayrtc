import { participantIdSchema, roomIdSchema } from "@relayrtc/validation";
import { z } from "zod";

export const participantParamsSchema = z
  .object({
    participantId: participantIdSchema,
    roomId: roomIdSchema,
  })
  .strict();

export const listParticipantsQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(["active", "left"]).optional(),
  })
  .strict();

export type ListParticipantsQuery = z.infer<typeof listParticipantsQuerySchema>;
