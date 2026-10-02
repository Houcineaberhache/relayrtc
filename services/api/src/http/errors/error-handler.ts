import type { FastifyInstance } from "fastify";

import { ApiError } from "./api-error.js";

interface ErrorResponse {
  code: string;
  description: string;
  requestId: string;
}

const hasValidationErrors = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("validation" in error)) return false;
  return Array.isArray(error.validation) && error.validation.length > 0;
};

export const registerErrorHandling = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: "ROUTE_NOT_FOUND",
      description: "The requested API route does not exist",
      requestId: request.id,
    } satisfies ErrorResponse),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        description: error.description,
        requestId: request.id,
      } satisfies ErrorResponse);
    }

    if (hasValidationErrors(error)) {
      return reply.status(400).send({
        code: "INVALID_REQUEST",
        description: "The request did not match the required API contract",
        requestId: request.id,
      } satisfies ErrorResponse);
    }

    request.log.error({ err: error }, "Unhandled API request error");
    return reply.status(500).send({
      code: "INTERNAL_SERVER_ERROR",
      description: "The request could not be completed",
      requestId: request.id,
    } satisfies ErrorResponse);
  });
};
