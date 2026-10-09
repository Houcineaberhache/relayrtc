import { randomUUID } from "node:crypto";

import type { RelayKitDatabase } from "@relayrtc/database";
import { schema } from "@relayrtc/database";
import { eq, sql } from "drizzle-orm";
import { validateUsageSample } from "./usage-sample-batch.js";

export type MediaUsageMetric =
  | "audioParticipantSeconds"
  | "screenShareEgressBytes"
  | "screenShareIngressBytes"
  | "screenShareSeconds"
  | "sfuEgressBytes"
  | "sfuIngressBytes"
  | "turnEgressBytes"
  | "turnIngressBytes"
  | "videoParticipantSeconds";

export interface MediaUsageMetricsStore {
  record(roomId: string, metric: MediaUsageMetric, value: number): Promise<void>;
  recordBatch?(
    roomId: string,
    sampleId: string,
    metrics: Partial<Record<MediaUsageMetric, number>>,
    occurredAt: Date,
  ): Promise<void>;
}

export const createMediaUsageMetricsStore = (
  database: RelayKitDatabase,
): Required<MediaUsageMetricsStore> => {
  const recordBatch = async (
    roomId: string,
    sampleId: string,
    metrics: Partial<Record<MediaUsageMetric, number>>,
    occurredAt: Date,
  ) => {
    validateUsageSample(roomId, sampleId, metrics, occurredAt);
    const values = Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b));
    const payload = Object.fromEntries(values);
    await database.transaction(async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${sampleId}, 732451))`,
      );
      const [existing] = await transaction
        .select()
        .from(schema.mediaUsageSample)
        .where(eq(schema.mediaUsageSample.id, sampleId))
        .limit(1);
      if (existing) {
        const previous = Object.entries(existing.metrics).sort(([a], [b]) => a.localeCompare(b));
        if (
          existing.roomId !== roomId ||
          existing.occurredAt.getTime() !== occurredAt.getTime() ||
          JSON.stringify(previous) !== JSON.stringify(values)
        )
          throw new Error("A media sample identity was reused with different contents");
        return;
      }
      const [scope] = await transaction
        .select({
          environmentId: schema.usageHistoryRoom.environmentId,
          organizationId: schema.usageHistoryRoom.organizationId,
          projectId: schema.usageHistoryRoom.projectId,
        })
        .from(schema.usageHistoryRoom)
        .where(eq(schema.usageHistoryRoom.id, roomId))
        .limit(1)
        .for("share");
      if (!scope) throw new Error("The retained room scope for a media sample is unavailable");
      await transaction
        .insert(schema.mediaUsageSample)
        .values({ id: sampleId, roomId, metrics: payload, occurredAt, ...scope });
      const positive = values.filter(([, value]) => value > 0);
      if (positive.length > 0)
        await transaction.insert(schema.usageEvent).values(
          positive.map(([metric, value]) => ({
            id: `usage_event_${sampleId}_${metric}`,
            metric,
            roomId,
            value,
            occurredAt,
            ...scope,
          })),
        );
    });
  };
  return {
    recordBatch,
    record: (roomId, metric, value) =>
      recordBatch(roomId, randomUUID(), { [metric]: value }, new Date()),
  };
};
