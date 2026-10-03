import type { FastifyPluginCallback } from "fastify";

import { MediaEngineError } from "../engine/errors.js";
import type { MediaEngine, MediaTransportDirection } from "../engine/media-engine.js";

interface MediaRoutesOptions {
  engine: MediaEngine;
}

interface RoomParameters {
  roomId: string;
}

interface TransportBody {
  direction: MediaTransportDirection;
  participantId: string;
}

const roomParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["roomId"],
  properties: { roomId: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

export const mediaRoutes: FastifyPluginCallback<MediaRoutesOptions> = (app, options, done) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof MediaEngineError) {
      const statusCode =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "CAPACITY_EXCEEDED"
            ? 429
            : error.code === "NOT_READY"
              ? 503
              : 501;
      return reply.code(statusCode).send({ code: error.code, description: error.message });
    }
    throw error;
  });

  app.get("/capacity", () => options.engine.getCapacity());

  app.post<{ Params: RoomParameters }>(
    "/rooms/:roomId",
    { schema: { params: roomParametersSchema } },
    async (request, reply) => {
      await options.engine.createRoom(request.params);
      return reply.code(201).send({ roomId: request.params.roomId });
    },
  );

  app.delete<{ Params: RoomParameters }>(
    "/rooms/:roomId",
    { schema: { params: roomParametersSchema } },
    async (request, reply) => {
      await options.engine.closeRoom(request.params);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: RoomParameters }>(
    "/rooms/:roomId/capabilities",
    { schema: { params: roomParametersSchema } },
    async (request) => ({
      roomId: request.params.roomId,
      routerCapabilities: await options.engine.getRouterCapabilities(request.params),
    }),
  );

  app.post<{ Body: TransportBody; Params: RoomParameters }>(
    "/rooms/:roomId/transports",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["direction", "participantId"],
          properties: {
            direction: { enum: ["receive", "send"] },
            participantId: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
        params: roomParametersSchema,
      },
    },
    async (request, reply) => {
      const transport = await options.engine.createParticipantTransport({
        ...request.body,
        roomId: request.params.roomId,
      });
      return reply.code(201).send({ roomId: request.params.roomId, ...transport });
    },
  );
  done();
};
