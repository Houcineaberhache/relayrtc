import type { RelayKitDatabase } from "@relayrtc/database";
import {
  organizationQuotaResponseSchema,
  organizationUsageQuerySchema,
  organizationUsageResponseSchema,
  projectAnalyticsQuerySchema,
  projectAnalyticsResponseSchema,
  projectUsageQuerySchema,
  projectUsageResponseSchema,
  quotaQuerySchema,
  reportingOrganizationParamsSchema,
  reportingProjectParamsSchema,
} from "@relayrtc/validation";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { z } from "zod";

import { authenticateApiKey } from "../../authentication/api-key-authenticator.js";
import { assertClaimedScope } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validate } from "../../http/validation/validate.js";
import {
  authorizeOrganizationReport,
  authorizeProjectReport,
  createReportingAccessRepository,
  type ReportingPrincipal,
} from "./reporting-access.js";

export type ConsoleSessionVerifier = (headers: Headers) => Promise<{ userId: string } | null>;

interface ReportingRoutesOptions {
  database: RelayKitDatabase;
  verifyConsoleSession?: ConsoleSessionVerifier;
}

declare module "fastify" {
  interface FastifyRequest {
    reportingPrincipal: ReportingPrincipal | null;
  }
}

const principalFor = (request: FastifyRequest): ReportingPrincipal => {
  if (!request.reportingPrincipal) {
    throw new ApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Provide an API key or a valid console session",
    );
  }
  return request.reportingPrincipal;
};

const unavailable = (): never => {
  throw new ApiError(
    501,
    "REPORTING_NOT_IMPLEMENTED",
    "Reporting calculations are not implemented yet",
  );
};

const responseSchema = (schema: z.ZodType) => ({
  response: { 200: z.toJSONSchema(schema, { io: "input" }) },
});

export const reportingRoutes: FastifyPluginCallback<ReportingRoutesOptions> = (
  app,
  options,
  done,
) => {
  const repository = createReportingAccessRepository(options.database);
  app.decorateRequest("reportingPrincipal", null);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    reply.header("x-relayrtc-api-version", "v1");
    if (request.headers.authorization !== undefined) {
      const token = /^Bearer ([^\s]+)$/u.exec(request.headers.authorization)?.[1];
      if (!token) {
        throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide an API key as a Bearer token");
      }
      const key = await authenticateApiKey(options.database, token);
      if (!key) {
        throw new ApiError(401, "INVALID_API_KEY", "The API key is invalid, expired, or revoked");
      }
      assertClaimedScope(request, key);
      request.reportingPrincipal = { type: "apiKey", key };
      return;
    }
    const headers = new Headers();
    if (request.headers.cookie) headers.set("cookie", request.headers.cookie);
    const session = await options.verifyConsoleSession?.(headers);
    if (!session) {
      throw new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Provide an API key or a valid console session",
      );
    }
    request.reportingPrincipal = { type: "session", userId: session.userId };
  });

  app.get(
    "/organizations/:organizationId/usage",
    {
      schema: responseSchema(organizationUsageResponseSchema),
    },
    async (request) => {
      const { organizationId } = validate(reportingOrganizationParamsSchema, request.params);
      validate(organizationUsageQuerySchema, request.query);
      await authorizeOrganizationReport(repository, principalFor(request), organizationId);
      return unavailable();
    },
  );

  app.get(
    "/organizations/:organizationId/quota",
    {
      schema: responseSchema(organizationQuotaResponseSchema),
    },
    async (request) => {
      const { organizationId } = validate(reportingOrganizationParamsSchema, request.params);
      validate(quotaQuerySchema, request.query);
      await authorizeOrganizationReport(repository, principalFor(request), organizationId);
      return organizationQuotaResponseSchema.parse({
        organizationId,
        status: "unconfigured",
        limits: [],
      });
    },
  );

  app.get(
    "/projects/:projectId/usage",
    {
      schema: responseSchema(projectUsageResponseSchema),
    },
    async (request) => {
      const { projectId } = validate(reportingProjectParamsSchema, request.params);
      const query = validate(projectUsageQuerySchema, request.query);
      await authorizeProjectReport(
        repository,
        principalFor(request),
        projectId,
        query.environmentId,
        "usage:read",
      );
      return unavailable();
    },
  );

  app.get(
    "/projects/:projectId/analytics",
    {
      schema: responseSchema(projectAnalyticsResponseSchema),
    },
    async (request) => {
      const { projectId } = validate(reportingProjectParamsSchema, request.params);
      const query = validate(projectAnalyticsQuerySchema, request.query);
      await authorizeProjectReport(
        repository,
        principalFor(request),
        projectId,
        query.environmentId,
        "analytics:read",
      );
      return unavailable();
    },
  );
  done();
};
