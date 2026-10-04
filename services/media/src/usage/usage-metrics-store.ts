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
}

export const createMediaUsageMetricsStore = (
  database: RelayKitDatabase,
): MediaUsageMetricsStore => ({
  async record(roomId, metric, value) {
    if (!Number.isFinite(value) || value <= 0) return;
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
    await database.insert(schema.usageEvent).values({
      id: `usage_event_${randomUUID()}`,
      metric,
      roomId,
      value: Math.floor(value),
      ...scope,
    });
  },
});
