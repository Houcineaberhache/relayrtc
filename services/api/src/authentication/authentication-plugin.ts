import type { RelayKitDatabase } from "@relayrtc/database";
import type { ApiKeyScope } from "@relayrtc/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { ApiError } from "../http/errors/api-error.js";
import { authenticateApiKey, type ApiKeyPrincipal } from "./api-key-authenticator.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey: ApiKeyPrincipal | null;
  }
}

const bearerToken = (authorization: string | undefined): string | null => {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  return match?.[1] ?? null;
};

const singleHeader = (value: string | string[] | undefined): string | null =>
  typeof value === "string" ? value : null;

const assertClaimedScope = (request: FastifyRequest, principal: ApiKeyPrincipal): void => {
  const claimedProjectId = singleHeader(request.headers["x-relayrtc-project-id"]);
  const claimedEnvironmentId = singleHeader(request.headers["x-relayrtc-environment-id"]);

  if (claimedProjectId !== null && claimedProjectId !== principal.projectId) {
    throw new ApiError(
      403,
      "PROJECT_SCOPE_MISMATCH",
      "The API key does not belong to the requested project",
    );
  }

  if (claimedEnvironmentId !== null && claimedEnvironmentId !== principal.environmentId) {
    throw new ApiError(
      403,
      "ENVIRONMENT_SCOPE_MISMATCH",
      "The API key does not belong to the requested environment",
    );
  }
};

export const registerAuthentication = (
  app: FastifyInstance,
  database: RelayKitDatabase,
): void => {
  app.decorateRequest("apiKey", null);

  app.addHook("onRequest", async (request) => {
    const rawKey = bearerToken(request.headers.authorization);
    if (!rawKey) {
      throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide an API key as a Bearer token");
    }

    const principal = await authenticateApiKey(database, rawKey);
    if (!principal) {
      throw new ApiError(401, "INVALID_API_KEY", "The API key is invalid, expired, or revoked");
    }

    assertClaimedScope(request, principal);
    request.apiKey = principal;
  });
};

export const requireApiKeyScope =
  (scope: ApiKeyScope) =>
  (request: FastifyRequest): void => {
    const principal = request.apiKey;
    if (!principal) {
      throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide a valid API key");
    }

    if (principal.keyType !== "secret" || !principal.scopes.includes(scope)) {
      throw new ApiError(
        403,
        "API_KEY_SCOPE_REQUIRED",
        `The API key requires the ${scope} scope`,
      );
    }
  };
