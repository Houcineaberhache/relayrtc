import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyPluginCallback } from "fastify";

import { registerAuthentication } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";

interface V1RoutesOptions {
  database: RelayKitDatabase;
}

const contextResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "environmentId", "keyId", "keyType", "projectId", "scopes"],
  properties: {
    apiVersion: { type: "string" },
    environmentId: { type: "string" },
    keyId: { type: "string" },
    keyType: { enum: ["publishable", "secret"] },
    projectId: { type: "string" },
    scopes: { type: "array", items: { type: "string" } },
  },
} as const;

export const v1Routes: FastifyPluginCallback<V1RoutesOptions> = (app, options, done) => {
  registerAuthentication(app, options.database);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-relayrtc-api-version", "v1");
    return payload;
  });

  app.get(
    "/",
    { schema: { response: { 200: contextResponseSchema } } },
    (request) => {
      const principal = request.apiKey;
      if (!principal) {
        throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide a valid API key");
      }

      return {
        apiVersion: "v1",
        environmentId: principal.environmentId,
        keyId: principal.keyId,
        keyType: principal.keyType,
        projectId: principal.projectId,
        scopes: principal.scopes,
      };
    },
  );

  done();
};
