import { randomUUID } from "node:crypto";

import type { RelayKitDatabase } from "@relayrtc/database";
import { schema } from "@relayrtc/database";
import { eq } from "drizzle-orm";

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
    const values = Object.entries(metrics).filter(
      ([, value]) => Number.isFinite(value) && value > 0,
    );
    if (values.length === 0) return;
    const [scope] = await database
      .select({
        environmentId: schema.room.environmentId,
        organizationId: schema.project.organizationId,
        projectId: schema.room.projectId,
      })
      .from(schema.room)
      .innerJoin(schema.project, eq(schema.project.id, schema.room.projectId))
      .where(eq(schema.room.id, roomId))
      .limit(1);
    if (!scope) return;
    await database
      .insert(schema.usageEvent)
      .values(
        values.map(([metric, value]) => ({
          id: `usage_event_${sampleId}_${metric}`,
          metric,
          roomId,
          value,
          occurredAt,
          ...scope,
        })),
      )
      .onConflictDoNothing();
  };
  return {
    recordBatch,
    record: (roomId, metric, value) =>
      recordBatch(roomId, randomUUID(), { [metric]: value }, new Date()),
  };
};
