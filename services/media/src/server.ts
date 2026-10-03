import { buildApp } from "./app.js";
import { readMediaEnvironment } from "./config/environment.js";
import { createMediasoupWorker } from "./engine/mediasoup-factory.js";
import { MediasoupWorkerPool } from "./engine/worker-pool.js";

const start = async (): Promise<void> => {
  const config = readMediaEnvironment(process.env);
  const engine = new MediasoupWorkerPool(config, createMediasoupWorker);
  await engine.start();
  const app = buildApp({ config, engine });

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
