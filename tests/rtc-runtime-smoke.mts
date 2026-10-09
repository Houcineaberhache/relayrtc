import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { migrate } from "../packages/database/node_modules/drizzle-orm/postgres-js/migrator.js";

import { createDatabase } from "../packages/database/dist/index.js";
import { buildApp } from "../services/media/dist/app.js";
import { readMediaEnvironment } from "../services/media/dist/config/environment.js";
import { createMediasoupWorker } from "../services/media/dist/engine/mediasoup-factory.js";
import { MediasoupWorkerPool } from "../services/media/dist/engine/worker-pool.js";

const databaseUrl = process.env.RELAYRTC_TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/relayrtc_usage_test") {
  throw new Error("A dedicated relayrtc_usage_test database is required");
}
const database = createDatabase(databaseUrl);
const config = readMediaEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  MEDIA_HOST: "127.0.0.1",
  MEDIA_LOG_LEVEL: "silent",
  MEDIA_RTC_LISTEN_IP: "127.0.0.1",
  MEDIA_RTC_ANNOUNCED_ADDRESS: "127.0.0.1",
  MEDIA_RTC_PORT: "45990",
  MEDIA_RTC_MAX_PORT: "45990",
  RELAYRTC_INTERNAL_SECRET: "test-rtc-control-secret-with-32-characters",
});
const engine = new MediasoupWorkerPool(config, createMediasoupWorker);
const app = buildApp({ config, engine });
try {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../packages/database/migrations", import.meta.url)),
  });
  await engine.start();
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  const status = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      "go",
      ["test", "-p", "1", "./internal/rtc", "./internal/app", "./internal/connection", "-count=1"],
      {
        cwd: fileURLToPath(new URL("../services/signaling", import.meta.url)),
        env: { ...process.env, RELAYRTC_TEST_MEDIA_URL: `${origin}/internal/v1` },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
  process.exitCode = status;
} finally {
  await app.close();
  await database.close();
}
