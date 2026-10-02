import { randomUUID } from "node:crypto";

import type { RelayKitDatabase } from "@relayrtc/database";
import Fastify, { type FastifyInstance } from "fastify";

import type { ApiConfig } from "./config/environment.js";
import { registerErrorHandling } from "./http/errors/error-handler.js";
import { createParticipantTokenSigner } from "./modules/participant-tokens/participant-token.signer.js";
import { healthRoutes } from "./routes/health.js";
import { v1Routes } from "./routes/v1/index.js";

interface BuildAppOptions {
  closeDatabase?: () => Promise<void>;
  config: ApiConfig;
  database: RelayKitDatabase;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

export const buildApp = (options: BuildAppOptions): FastifyInstance => {
  const app = Fastify({
    bodyLimit: 1_048_576,
    connectionTimeout: 10_000,
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return typeof requestId === "string" && requestIdPattern.test(requestId)
        ? requestId
        : randomUUID();
    },
    logger: {
      level: options.config.logLevel,
      redact: {
        censor: "[REDACTED]",
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "request.headers.authorization",
          "request.headers.cookie",
        ],
      },
    },
    requestIdHeader: "x-request-id",
    requestTimeout: 30_000,
    trustProxy: options.config.trustProxy,
  });
  const participantTokenSigner = createParticipantTokenSigner({
    audience: options.config.participantTokenAudience,
    issuer: options.config.participantTokenIssuer,
    keyId: options.config.participantTokenKeyId,
    secret: options.config.participantTokenSigningSecret,
  });

  registerErrorHandling(app);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  if (options.closeDatabase) {
    app.addHook("onClose", async () => options.closeDatabase?.());
  }

  void app.register(healthRoutes, { database: options.database });
  void app.register(v1Routes, {
    database: options.database,
    participantTokenSigner,
    prefix: "/v1",
  });

  return app;
};
