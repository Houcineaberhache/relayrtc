import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyInstance } from "fastify";
import { expireUsageHistory } from "./usage-retention.service.js";

export function registerUsageRetention(app: FastifyInstance, database: RelayKitDatabase, retentionDays: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopping = false;
  const run = async () => {
    let delay = 86400_000;
    try {
      await expireUsageHistory(database, retentionDays);
    } catch (error) {
      delay = 300_000;
      app.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Usage retention failed; retrying in five minutes");
    }
    if (!stopping) timer = setTimeout(() => { pending = run(); }, delay).unref();
  };
  app.addHook("onReady", async () => { pending = run(); await pending; });
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await pending;
  };
}
