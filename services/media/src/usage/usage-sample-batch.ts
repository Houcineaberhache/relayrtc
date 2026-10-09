import { usageMetricDefinitions } from "@relayrtc/types";
import type { MediaUsageMetric, MediaUsageMetricsStore } from "./usage-metrics-store.js";

export function validateUsageSample(
  roomId: string,
  sampleId: string,
  metrics: Partial<Record<MediaUsageMetric, number>>,
  occurredAt: Date,
): void {
  if (!roomId || !sampleId || sampleId.length > 256 || !Number.isFinite(occurredAt.getTime()))
    throw new Error("Usage samples require a room, stable identity and occurrence time");
  for (const [metric, value] of Object.entries(metrics)) {
    if (!Object.hasOwn(usageMetricDefinitions, metric))
      throw new Error("Unknown media usage metric");
    const definition = usageMetricDefinitions[metric as MediaUsageMetric];
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (definition.integer && !Number.isSafeInteger(value))
    )
      throw new Error(`Invalid ${metric} usage sample`);
  }
}

export async function persistUsageSample(
  store: MediaUsageMetricsStore,
  roomId: string,
  sampleId: string,
  metrics: Partial<Record<MediaUsageMetric, number>>,
  occurredAt: Date,
): Promise<void> {
  validateUsageSample(roomId, sampleId, metrics, occurredAt);
  if (Object.values(metrics).every((value) => value === 0)) return;
  if (store.recordBatch) await store.recordBatch(roomId, sampleId, metrics, occurredAt);
  else
    for (const [metric, value] of Object.entries(metrics))
      await store.record(roomId, metric as MediaUsageMetric, value);
}
