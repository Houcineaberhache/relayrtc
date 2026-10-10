import type { RelayKitDatabase } from "@relayrtc/database";
import { schema } from "@relayrtc/database";
import type { ConnectionQuality } from "@relayrtc/types";
import { sql } from "drizzle-orm";

import type { SubscriberNetworkStats } from "../engine/quality-controller.js";
import { qualitySeverity } from "./quality-model.js";
import type { QualityTransition } from "./quality-event-publisher.js";

export interface QualityMetricSample {
  sampleId?: string;
  participantId: string;
  quality: ConnectionQuality;
  roomId: string;
  stats: SubscriberNetworkStats;
}

export interface QualityMetricsStore {
  readonly persistsEvents?: boolean;
  record(sample: QualityMetricSample, transition?: QualityTransition): Promise<void>;
}

export const qualityBucketStart = (date: Date): Date => {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  return bucket;
};

export const createQualityMetricsStore = (database: RelayKitDatabase): QualityMetricsStore => ({
  persistsEvents: true,
  async record(sample, transition) {
    const metric = schema.rtcQualityMetric;
    const bitrate = sample.stats.availableIncomingBitrate;
    const jitter = sample.stats.jitter;
    const roundTripTime = sample.stats.roundTripTime;
    const severity = qualitySeverity[sample.quality];
    const now = new Date(sample.stats.timestamp);

    await database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('statement_timeout', '3000', true)`);
      if (sample.sampleId) {
        const inserted = await transaction.execute(
          sql`insert into rtc_quality_sample_receipt (id) values (${sample.sampleId}) on conflict (id) do nothing returning id`,
        );
        if (inserted.length === 0) return;
      }
      await transaction
        .insert(metric)
        .values({
          bitrateSampleCount: bitrate === null ? 0 : 1,
          bucketStartedAt: qualityBucketStart(now),
          incomingBitrateSum: bitrate ?? 0,
          jitterSampleCount: jitter === null ? 0 : 1,
          jitterSum: jitter ?? 0,
          latestQuality: sample.quality,
          packetsLost: sample.stats.packetsLost,
          packetsReceived: sample.stats.packetsReceived,
          participantId: sample.participantId,
          roomId: sample.roomId,
          roundTripTimeSampleCount: roundTripTime === null ? 0 : 1,
          roundTripTimeSum: roundTripTime ?? 0,
          sampleCount: 1,
          updatedAt: now,
          worstQuality: sample.quality,
          worstQualitySeverity: severity,
        })
        .onConflictDoUpdate({
          target: [metric.roomId, metric.participantId, metric.bucketStartedAt],
          set: {
            bitrateSampleCount: sql`${metric.bitrateSampleCount} + ${bitrate === null ? 0 : 1}`,
            incomingBitrateSum: sql`${metric.incomingBitrateSum} + ${bitrate ?? 0}`,
            jitterSampleCount: sql`${metric.jitterSampleCount} + ${jitter === null ? 0 : 1}`,
            jitterSum: sql`${metric.jitterSum} + ${jitter ?? 0}`,
            latestQuality: sample.quality,
            packetsLost: sql`${metric.packetsLost} + ${sample.stats.packetsLost}`,
            packetsReceived: sql`${metric.packetsReceived} + ${sample.stats.packetsReceived}`,
            roundTripTimeSampleCount: sql`${metric.roundTripTimeSampleCount} + ${roundTripTime === null ? 0 : 1}`,
            roundTripTimeSum: sql`${metric.roundTripTimeSum} + ${roundTripTime ?? 0}`,
            sampleCount: sql`${metric.sampleCount} + 1`,
            updatedAt: now,
            worstQuality: sql`case when ${severity} > ${metric.worstQualitySeverity} then ${sample.quality} else ${metric.worstQuality} end`,
            worstQualitySeverity: sql`greatest(${metric.worstQualitySeverity}, ${severity})`,
          },
        });
      if (transition?.event.eventId) {
        const event = transition.event;
        await transaction.execute(sql`insert into rtc_quality_event_outbox
        (id, room_id, participant_id, session_id, event_type, payload, occurred_at, expires_at)
        values (${event.eventId}, ${sample.roomId}, ${sample.participantId}, ${event.sessionId ?? sample.participantId},
          ${transition.type}, ${JSON.stringify(event)}::jsonb, ${event.occurredAt}, ${new Date(Date.now() + 300_000).toISOString()})
        on conflict (id) do nothing`);
      }
    });
  },
});
