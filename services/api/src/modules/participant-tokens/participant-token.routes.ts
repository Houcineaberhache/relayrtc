import { schema, type RelayKitDatabase } from "@relayrtc/database";
import { eq } from "drizzle-orm";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";

import { requireApiKeyScope } from "../../authentication/authentication-plugin.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validate } from "../../http/validation/validate.js";
import { createRoomRepository } from "../rooms/room.repository.js";
import { roomParamsSchema } from "../rooms/room.schema.js";
import { createParticipantTokenBodySchema } from "./participant-token.schema.js";
import { createParticipantTokenService } from "./participant-token.service.js";
import type { ParticipantTokenSigner } from "./participant-token.signer.js";

interface ParticipantTokenRoutesOptions {
  database: RelayKitDatabase;
  signer: ParticipantTokenSigner;
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

export const participantTokenRoutes: FastifyPluginCallback<ParticipantTokenRoutesOptions> = (
  app,
  options,
  done,
) => {
  const service = createParticipantTokenService({
    isProjectActive: async ({ projectId }) => {
      const [project] = await options.database
        .select({ status: schema.project.status })
        .from(schema.project)
        .where(eq(schema.project.id, projectId));
      return project?.status === "active";
    },
    roomRepository: createRoomRepository(options.database),
    signer: options.signer,
  });

  app.post(
    "/rooms/:roomId/tokens",
    { preHandler: requireApiKeyScope("tokens:create") },
    async (request, reply) => {
      const params = validate(roomParamsSchema, request.params);
      const body = validate(createParticipantTokenBodySchema, request.body);
      const token = await service.create(requestScope(request), params.roomId, body);
      return reply.status(201).send(token);
    },
  );

  done();
};
