import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyInstance } from "fastify";
import { collectTurnAllocationLogs, reconcileTurnAllocations } from "./turn-allocation.service.js";

export function registerTurnAllocationCollector(
  app: FastifyInstance,
  database: RelayKitDatabase,
  directory: string,
  metricsUrl?: string,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let lastReconciled = 0;
  const run = async () => {
    try {
      const result = await collectTurnAllocationLogs(database, directory);
      if (metricsUrl && Date.now() - lastReconciled >= 30000) {
        const snapshot = await reconcileTurnAllocations(database, directory, metricsUrl);
        lastReconciled = Date.now();
        const log =
          snapshot.status === "different" ? app.log.warn.bind(app.log) : app.log.info.bind(app.log);
        log(
          { turnAccounting: snapshot, collectedFiles: result.files },
          "TURN accounting reconciliation",
        );
      }
    } catch (error) {
      app.log.error(
        { err: error },
        "TURN accounting collection failed; checkpoint retained for retry",
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          pending = run();
        }, 1000);
        timer.unref();
      }
    }
  };
  app.addHook("onReady", (done) => {
    pending = run();
    done();
  });
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}
