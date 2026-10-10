import type { RelayKitDatabase } from "@relayrtc/database";
import {
  createWebhookInputSchema,
  listWebhookQuerySchema,
  projectIdSchema,
  revealedWebhookConfigurationSchema,
  updateWebhookInputSchema,
  webhookConfigurationListSchema,
  webhookConfigurationSchema,
  webhookEndpointIdSchema,
  webhookScopeQuerySchema,
} from "@relayrtc/validation";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { z } from "zod";

import { authenticateApiKey } from "../../authentication/api-key-authenticator.js";
import { assertClaimedScope } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validate } from "../../http/validation/validate.js";
import type { ConsoleSessionVerifier } from "../reporting/reporting.routes.js";
import { createWebhookService, type WebhookPrincipal } from "./webhook.service.js";

interface WebhookRoutesOptions {
  database: RelayKitDatabase;
  encryptionKey?: string;
  projectRoutes?: boolean;
  verifyConsoleSession?: ConsoleSessionVerifier;
  consoleOrigin?: string;
}
declare module "fastify" {
  interface FastifyRequest {
    webhookPrincipal: WebhookPrincipal | null;
  }
}
const routeParams = z
  .object({ projectId: projectIdSchema.optional(), endpointId: webhookEndpointIdSchema.optional() })
  .strict();
const noBody = z.object({}).strict();
const response = (status: number, schema: z.ZodType) => ({
  response: { [status]: z.toJSONSchema(schema, { io: "input" }) },
});

export const webhookRoutes: FastifyPluginCallback<WebhookRoutesOptions> = (app, options, done) => {
  const service = createWebhookService({
    database: options.database,
    ...(options.encryptionKey ? { encryptionKey: options.encryptionKey } : {}),
  });
  app.decorateRequest("webhookPrincipal", null);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    reply.header("x-relayrtc-api-version", "v1");
    if (!options.projectRoutes) {
      if (!request.apiKey)
        throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide a valid API key");
      request.webhookPrincipal = { type: "apiKey", key: request.apiKey };
      return;
    }
    if (request.headers.authorization !== undefined) {
      const token = /^Bearer ([^\s]+)$/u.exec(request.headers.authorization)?.[1];
      const key = token ? await authenticateApiKey(options.database, token) : null;
      if (!key)
        throw new ApiError(401, "INVALID_API_KEY", "Provide a valid API key as a Bearer token");
      assertClaimedScope(request, key);
      request.webhookPrincipal = { type: "apiKey", key };
      return;
    }
    const headers = new Headers();
    if (request.headers.cookie) headers.set("cookie", request.headers.cookie);
    const session = await options.verifyConsoleSession?.(headers);
    if (!session)
      throw new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Provide an API key or a valid console session",
      );
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      (!options.consoleOrigin || request.headers.origin !== options.consoleOrigin)
    )
      throw new ApiError(
        403,
        "WEBHOOK_ORIGIN_REQUIRED",
        "Console webhook changes require a trusted Origin header",
      );
    request.webhookPrincipal = { type: "session", userId: session.userId };
  });
  const context = (request: FastifyRequest, list = false) => {
    const principal = request.webhookPrincipal;
    if (!principal) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide valid credentials");
    const params = validate(routeParams, request.params);
    const query = validate(list ? listWebhookQuerySchema : webhookScopeQuerySchema, request.query);
    const projectId =
      params.projectId ??
      query.projectId ??
      (principal.type === "apiKey" ? principal.key.projectId : undefined);
    const environmentId =
      query.environmentId ??
      (principal.type === "apiKey" ? principal.key.environmentId : undefined);
    if (!projectId || !environmentId)
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Select a project and environment for webhook configuration",
      );
    if (query.projectId !== undefined && query.projectId !== projectId)
      throw new ApiError(
        403,
        "PROJECT_SCOPE_MISMATCH",
        "The requested project scopes do not match",
      );
    return { principal, scope: { projectId, environmentId }, endpointId: params.endpointId, query };
  };
  const base = options.projectRoutes ? "/projects/:projectId/webhooks" : "/webhooks";
  app.get(base, { schema: response(200, webhookConfigurationListSchema) }, async (request) => {
    const { principal, scope } = context(request, true);
    const { limit, offset } = validate(listWebhookQuerySchema, request.query);
    return service.list(principal, scope, { limit, offset });
  });
  app.post(
    base,
    { schema: response(201, revealedWebhookConfigurationSchema) },
    async (request, reply) => {
      const { principal, scope } = context(request);
      const result = await service.create(
        principal,
        scope,
        validate(createWebhookInputSchema, request.body),
      );
      return reply.status(201).send(result);
    },
  );
  app.get(
    `${base}/:endpointId`,
    { schema: response(200, webhookConfigurationSchema) },
    async (request) => {
      const { principal, scope, endpointId } = context(request);
      if (!endpointId) throw new ApiError(400, "INVALID_REQUEST", "Provide a webhook endpoint ID");
      return service.get(principal, scope, endpointId);
    },
  );
  app.patch(
    `${base}/:endpointId`,
    { schema: response(200, webhookConfigurationSchema) },
    async (request) => {
      const { principal, scope, endpointId } = context(request);
      if (!endpointId) throw new ApiError(400, "INVALID_REQUEST", "Provide a webhook endpoint ID");
      return service.update(
        principal,
        scope,
        endpointId,
        validate(updateWebhookInputSchema, request.body),
      );
    },
  );
  app.post(
    `${base}/:endpointId/rotate-secret`,
    { schema: response(200, revealedWebhookConfigurationSchema) },
    async (request) => {
      const { principal, scope, endpointId } = context(request);
      if (!endpointId) throw new ApiError(400, "INVALID_REQUEST", "Provide a webhook endpoint ID");
      validate(noBody, request.body ?? {});
      return service.rotate(principal, scope, endpointId);
    },
  );
  app.delete(`${base}/:endpointId`, async (request, reply) => {
    const { principal, scope, endpointId } = context(request);
    if (!endpointId) throw new ApiError(400, "INVALID_REQUEST", "Provide a webhook endpoint ID");
    validate(noBody, request.body ?? {});
    await service.remove(principal, scope, endpointId);
    return reply.status(204).send();
  });
  done();
};
