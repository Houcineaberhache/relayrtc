import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";

import { requireApiKeyScope } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validate } from "../../http/validation/validate.js";
import { createRoomRepository } from "./room.repository.js";
import {
  createRoomBodySchema,
  listRoomsQuerySchema,
  roomParamsSchema,
} from "./room.schema.js";
import { createRoomService } from "./room.service.js";

interface RoomRoutesOptions {
  database: RelayKitDatabase;
}

const requestScope = (request: FastifyRequest) => {
  const principal = request.apiKey;
  if (!principal) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Provide a valid API key");
  }

  return {
    environmentId: principal.environmentId,
    projectId: principal.projectId,
  };
};

export const roomRoutes: FastifyPluginCallback<RoomRoutesOptions> = (app, options, done) => {
  const service = createRoomService(createRoomRepository(options.database));

  app.post(
    "/rooms",
    { preHandler: requireApiKeyScope("rooms:create") },
    async (request, reply) => {
      const body = validate(createRoomBodySchema, request.body);
      const room = await service.create(requestScope(request), body);
      return reply.status(201).send(room);
    },
  );

  app.get(
    "/rooms",
    { preHandler: requireApiKeyScope("rooms:read") },
    async (request) => {
      const query = validate(listRoomsQuerySchema, request.query);
      return service.list(requestScope(request), query);
    },
  );

  app.get(
    "/rooms/:roomId",
    { preHandler: requireApiKeyScope("rooms:read") },
    async (request) => {
      const params = validate(roomParamsSchema, request.params);
      return service.get(requestScope(request), params.roomId);
    },
  );

  app.delete(
    "/rooms/:roomId",
    { preHandler: requireApiKeyScope("rooms:end") },
    async (request, reply) => {
      const params = validate(roomParamsSchema, request.params);
      await service.end(requestScope(request), params.roomId);
      return reply.status(204).send();
    },
  );

  done();
};
