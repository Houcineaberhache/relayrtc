import { buildApp } from "./app.js";
import { createDatabase } from "@relayrtc/database";
import { readMediaEnvironment } from "./config/environment.js";
import { createMediasoupWorker } from "./engine/mediasoup-factory.js";
import { MediasoupWorkerPool } from "./engine/worker-pool.js";
import { createHttpQualityEventPublisher } from "./quality/quality-event-publisher.js";
import { createQualityMetricsStore } from "./quality/quality-metrics-store.js";
import { createMediaUsageMetricsStore } from "./usage/usage-metrics-store.js";

const start = async (): Promise<void> => {
  const config = readMediaEnvironment(process.env);
  const database = createDatabase(config.databaseUrl, { maxConnections: 4 });
  const engine = new MediasoupWorkerPool(config, createMediasoupWorker, {
    eventPublisher: createHttpQualityEventPublisher({
      internalSecret: config.internalSecret,
      signalingUrl: config.signalingInternalUrl,
    }),
    metricsStore: createQualityMetricsStore(database.db),
    usageMetricsStore: createMediaUsageMetricsStore(database.db),
    onUsageError: (error) => {
      console.error(
        "Media usage persistence failed",
        error instanceof Error ? error.name : "UnknownError",
      );
    },
  });
  await engine.start();
  const usageTimer = setInterval(() => void engine.flushUsage(), 2_000);
  usageTimer.unref();
  const app = buildApp({ config, engine });
  app.addHook("onClose", async () => {
    clearInterval(usageTimer);
    await engine.close();
    await database.close();
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, "Stopping RelayRTC media service");
    await app.close();
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.fatal({ err: error }, "Unable to start RelayRTC media service");
    await app.close();
    process.exitCode = 1;
  }
};

void start();
