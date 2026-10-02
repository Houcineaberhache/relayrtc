import { createDatabase } from "@relayrtc/database";

import { buildApp } from "./app.js";
import { readApiEnvironment } from "./config/environment.js";

const start = async (): Promise<void> => {
  const config = readApiEnvironment(process.env);
  const database = createDatabase(config.databaseUrl);
  const app = buildApp({
    closeDatabase: database.close,
    config,
    database: database.db,
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, "Stopping RelayRTC API");
    await app.close();
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.fatal({ err: error }, "Unable to start RelayRTC API");
    await app.close();
    process.exitCode = 1;
  }
};

void start();
