import {
  connectionQualities,
  roomQualityModes,
  type ConnectionQualityEvent,
  type QualityModeSettings,
} from "@relayrtc/types";
import { z } from "zod";

import { isoDateTimeSchema, participantIdSchema, roomIdSchema } from "./common.js";

export const connectionQualitySchema = z.enum(connectionQualities);
export const roomQualityModeSchema = z.enum(roomQualityModes);
export const videoQualityPreferenceSchema = z.enum(["auto", "1080p", "720p", "360p", "audio-only"]);

export const qualityModeSettingsSchema: z.ZodType<QualityModeSettings> = z
  .object({
    receive: videoQualityPreferenceSchema,
    send: videoQualityPreferenceSchema,
  })
  .strict();

export const connectionQualityEventSchema: z.ZodType<ConnectionQualityEvent> = z
  .object({
    occurredAt: isoDateTimeSchema,
    participantId: participantIdSchema,
    previousQuality: connectionQualitySchema,
    quality: connectionQualitySchema,
    roomId: roomIdSchema,
  })
  .strict();
