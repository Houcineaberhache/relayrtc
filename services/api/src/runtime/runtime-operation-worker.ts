import {
  processRuntimeOperation,
  reconcileRuntimeOperations,
  type RoomTerminationConfig,
} from "@relayrtc/auth";
import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyInstance } from "fastify";

export function registerRuntimeOperationWorker(
  app: FastifyInstance,
  database: RelayKitDatabase,
  config: RoomTerminationConfig,
) {
  const shutdown = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let reconciledAt = 0;
  const run = async () => {
    try {
      if (Date.now() - reconciledAt >= 30_000) {
        await reconcileRuntimeOperations(database);
        reconciledAt = Date.now();
      }
      for (let index = 0; index < 25 && !shutdown.signal.aborted; index++) {
        const operation = await processRuntimeOperation(
          database,
          config,
          undefined,
          shutdown.signal,
        );
        if (!operation) break;
        if (operation.status === "failed")
          app.log.warn(
            { operationId: operation.id, attempts: operation.attempts },
            "Runtime cleanup will retry",
          );
      }
    } catch {
      if (!shutdown.signal.aborted)
        app.log.error("Runtime operation worker could not reach its store; retrying");
    }
    if (!shutdown.signal.aborted)
      timer = setTimeout(() => {
        pending = run();
      }, 1_000).unref();
  };
  app.addHook("onReady", (done) => {
    pending = run();
    done();
  });
  return async () => {
    shutdown.abort();
    clearTimeout(timer);
    await pending;
  };
}
