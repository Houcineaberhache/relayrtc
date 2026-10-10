import { z } from "zod";
import { roomIdSchema, sessionIdSchema, videoQualityPreferenceSchema } from "@relayrtc/validation";
import { protocolRequestSchema, protocolResponseSchema } from "./envelope.js";
import type { ProtocolRequest, ProtocolResponse } from "./envelope.js";

export const subscriberStatsSchema = z
  .object({
    availableIncomingBitrate: z.number().nonnegative().nullable(),
    incomingBitrate: z.number().nonnegative().nullable().optional(),
    jitter: z.number().nonnegative().nullable(),
    roundTripTime: z.number().nonnegative().nullable(),
    packetsLost: z.number().int().nonnegative(),
    packetsReceived: z.number().int().nonnegative(),
    packetLossRatio: z.number().min(0).max(1).nullable().optional(),
    timestamp: z.number().positive(),
    stale: z.boolean().optional(),
  })
  .strict();
const scope = z.object({ roomId: roomIdSchema, sessionId: sessionIdSchema }).strict();
const payload = scope
  .extend({ transportId: z.string().min(1).max(256), stats: subscriberStatsSchema })
  .strict();
export type RtcStatsReportRequest = ProtocolRequest<"rtc.stats.report", z.infer<typeof payload>>;
export type RtcStatsAcceptedResponse = ProtocolResponse<
  "rtc.stats.accepted",
  z.infer<typeof scope>
>;
export const rtcStatsReportRequestSchema = protocolRequestSchema("rtc.stats.report", payload);
export const rtcStatsAcceptedResponseSchema = protocolResponseSchema("rtc.stats.accepted", scope);

const subscriptionQuality = scope
  .extend({ subscriptionId: z.string().min(1).max(256), quality: videoQualityPreferenceSchema })
  .strict();
export type RtcSubscriptionQualityRequest = ProtocolRequest<
  "rtc.subscription.quality",
  z.infer<typeof subscriptionQuality>
>;
export type RtcSubscriptionQualityAcceptedResponse = ProtocolResponse<
  "rtc.subscription.quality.accepted",
  z.infer<typeof subscriptionQuality>
>;
export const rtcSubscriptionQualityRequestSchema = protocolRequestSchema(
  "rtc.subscription.quality",
  subscriptionQuality,
);
export const rtcSubscriptionQualityAcceptedResponseSchema = protocolResponseSchema(
  "rtc.subscription.quality.accepted",
  subscriptionQuality,
);
