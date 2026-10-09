import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyInstance } from "fastify";
import { processUsageAggregation } from "./usage-aggregation.service.js";

export function registerUsageAggregation(
  app: FastifyInstance,
  database: RelayKitDatabase,
  retentionDays: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopping = false;
  let batchSize = 24;
  const run = async () => {
    let delay = 60_000;
    try {
      const result = await processUsageAggregation(database, { retentionDays, batchSize });
      app.log.info(result, "Usage aggregation checkpoint");
      if ((result.pendingHours ?? 0) > 0) delay = 1000;
    } catch (error) {
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      app.log.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Usage aggregation failed; checkpoint retained for retry",
      );
    }
    if (!stopping)
      timer = setTimeout(() => {
        pending = run();
      }, delay).unref();
  };
  app.addHook("onReady", (done) => {
    pending = run();
    done();
  });
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await pending;
  };
}
