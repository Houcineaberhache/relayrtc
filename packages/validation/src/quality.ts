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
    eventId: z.uuid().optional(),
    source: z.enum(["media", "connectivity"]).optional(),
    sessionId: z.string().min(1).max(128).optional(),
    metrics: z
      .object({
        availableIncomingBitrate: z.number().nonnegative().nullable(),
        incomingBitrate: z.number().nonnegative().nullable(),
        jitter: z.number().nonnegative().nullable(),
        roundTripTime: z.number().nonnegative().nullable(),
        packetLossRatio: z.number().min(0).max(1).nullable(),
        timestamp: z.number().nonnegative(),
        stale: z.boolean(),
      })
      .strict()
      .optional(),
    occurredAt: isoDateTimeSchema,
    participantId: participantIdSchema,
    previousQuality: connectionQualitySchema,
    quality: connectionQualitySchema,
    roomId: roomIdSchema,
  })
  .strict();
