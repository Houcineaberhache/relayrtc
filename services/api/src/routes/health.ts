import type { RelayKitDatabase } from "@relayrtc/database";
import { sql } from "drizzle-orm";
import type { FastifyPluginCallback } from "fastify";

import { ApiError } from "../http/errors/api-error.js";

interface HealthRoutesOptions {
  database: RelayKitDatabase;
}

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["service", "status"],
  properties: {
    service: { type: "string" },
    status: { type: "string" },
  },
} as const;

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, options, done) => {
  app.get(
    "/health",
    { schema: { response: { 200: healthResponseSchema } } },
    () => ({ service: "relayrtc-api", status: "ok" }),
  );

  app.get(
    "/ready",
    { schema: { response: { 200: healthResponseSchema } } },
    async () => {
      try {
        await options.database.execute(sql`select 1`);
      } catch {
        throw new ApiError(503, "SERVICE_NOT_READY", "The API database is not ready");
      }

      return { service: "relayrtc-api", status: "ready" };
    },
  );

  done();
};
