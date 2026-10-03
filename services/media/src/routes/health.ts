import type { FastifyPluginCallback } from "fastify";

import type { MediaEngine } from "../engine/media-engine.js";

interface HealthRoutesOptions {
  engine?: MediaEngine;
  nodeId: string;
}

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nodeId", "service", "status"],
  properties: {
    nodeId: { type: "string" },
    service: { type: "string" },
    status: { type: "string" },
  },
} as const;

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, options, done) => {
  app.get(
    "/health",
    { schema: { response: { 200: healthResponseSchema } } },
    () => ({ nodeId: options.nodeId, service: "relayrtc-media", status: "ok" }),
  );

  app.get(
    "/ready",
    {
      schema: {
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const health = await options.engine?.getHealth();
      const ready = health?.healthy ?? true;
      if (!ready) reply.code(503);
      return {
        nodeId: options.nodeId,
        service: "relayrtc-media",
        status: ready ? "ready" : "not_ready",
      };
    },
  );
  done();
};
