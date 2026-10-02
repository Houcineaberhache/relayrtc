import type { RelayKitDatabase } from "@relayrtc/database";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";

import { requireApiKeyScope } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validate } from "../../http/validation/validate.js";
import { createRoomRepository } from "../rooms/room.repository.js";
import { roomParamsSchema } from "../rooms/room.schema.js";
import { createParticipantRepository } from "./participant.repository.js";
import { participantParamsSchema, listParticipantsQuerySchema } from "./participant.schema.js";
import { createParticipantService } from "./participant.service.js";

interface ParticipantRoutesOptions {
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

export const participantRoutes: FastifyPluginCallback<ParticipantRoutesOptions> = (
  app,
  options,
  done,
) => {
  const service = createParticipantService({
    participantRepository: createParticipantRepository(options.database),
    roomRepository: createRoomRepository(options.database),
  });

  app.get(
    "/rooms/:roomId/participants",
    { preHandler: requireApiKeyScope("participants:read") },
    async (request) => {
      const params = validate(roomParamsSchema, request.params);
      const query = validate(listParticipantsQuerySchema, request.query);
      return service.list(requestScope(request), params.roomId, query);
    },
  );

  app.get(
    "/rooms/:roomId/participants/:participantId",
    { preHandler: requireApiKeyScope("participants:read") },
    async (request) => {
      const params = validate(participantParamsSchema, request.params);
      return service.get(requestScope(request), params.roomId, params.participantId);
    },
  );

  app.delete(
    "/rooms/:roomId/participants/:participantId",
    { preHandler: requireApiKeyScope("participants:remove") },
    async (request, reply) => {
      const params = validate(participantParamsSchema, request.params);
      await service.remove(requestScope(request), params.roomId, params.participantId);
      return reply.status(204).send();
    },
  );

  done();
};
