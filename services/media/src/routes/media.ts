import type { FastifyPluginCallback } from "fastify";

import { MediaEngineError } from "../engine/errors.js";
import type {
  MediaEngine,
  MediaKind,
  MediaTrackType,
  MediaTransportDirection,
} from "../engine/media-engine.js";

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

interface ConnectTransportBody {
  dtlsParameters: Readonly<Record<string, unknown>>;
  participantId: string;
}

interface OwnedTransportBody {
  participantId: string;
}

interface TransportParameters extends RoomParameters {
  transportId: string;
}

interface PublishTrackBody {
  kind: MediaKind;
  participantId: string;
  rtpParameters: Readonly<Record<string, unknown>>;
  transportId: string;
  trackType: MediaTrackType;
}

interface SubscribeTrackBody {
  participantId: string;
  rtpCapabilities: Readonly<Record<string, unknown>>;
  trackId: string;
  transportId: string;
}

interface TrackParameters extends RoomParameters {
  participantId: string;
  trackId: string;
}

const roomParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["roomId"],
  properties: { roomId: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

const rtcParametersSchema = { type: "object", additionalProperties: true } as const;

export const mediaRoutes: FastifyPluginCallback<MediaRoutesOptions> = (app, options, done) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof MediaEngineError) {
      const statusCode =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "INVALID_REQUEST"
              ? 400
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

  app.get<{ Params: RoomParameters }>(
    "/rooms/:roomId/tracks",
    { schema: { params: roomParametersSchema } },
    async (request) => ({
      roomId: request.params.roomId,
      tracks: await options.engine.listPublishedTracks(request.params),
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

  app.patch<{ Body: ConnectTransportBody; Params: TransportParameters }>(
    "/rooms/:roomId/transports/:transportId",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["dtlsParameters", "participantId"],
          properties: {
            dtlsParameters: rtcParametersSchema,
            participantId: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      await options.engine.connectParticipantTransport({ ...request.body, ...request.params });
      return reply.code(204).send();
    },
  );

  app.post<{ Body: OwnedTransportBody; Params: TransportParameters }>(
    "/rooms/:roomId/transports/:transportId/restart-ice",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["participantId"],
          properties: { participantId: { type: "string", minLength: 1, maxLength: 128 } },
        },
      },
    },
    async (request) => ({
      iceParameters: await options.engine.restartParticipantTransport({
        ...request.body,
        ...request.params,
      }),
    }),
  );

  app.post<{ Body: PublishTrackBody; Params: RoomParameters }>(
    "/rooms/:roomId/tracks",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "participantId", "rtpParameters", "trackType", "transportId"],
          properties: {
            kind: { enum: ["audio", "video"] },
            participantId: { type: "string", minLength: 1, maxLength: 128 },
            rtpParameters: rtcParametersSchema,
            transportId: { type: "string", minLength: 1, maxLength: 256 },
            trackType: { enum: ["audio", "camera_video", "screen_audio", "screen_video"] },
          },
        },
        params: roomParametersSchema,
      },
    },
    async (request, reply) => {
      const track = await options.engine.publishTrack({
        ...request.body,
        roomId: request.params.roomId,
      });
      return reply.code(201).send({ roomId: request.params.roomId, track });
    },
  );

  app.post<{ Body: SubscribeTrackBody; Params: RoomParameters }>(
    "/rooms/:roomId/subscriptions",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["participantId", "rtpCapabilities", "trackId", "transportId"],
          properties: {
            participantId: { type: "string", minLength: 1, maxLength: 128 },
            rtpCapabilities: rtcParametersSchema,
            trackId: { type: "string", minLength: 1, maxLength: 256 },
            transportId: { type: "string", minLength: 1, maxLength: 256 },
          },
        },
        params: roomParametersSchema,
      },
    },
    async (request, reply) => {
      const subscription = await options.engine.subscribeTrack({
        ...request.body,
        roomId: request.params.roomId,
      });
      return reply.code(201).send({ roomId: request.params.roomId, subscription });
    },
  );

  app.delete<{ Params: TrackParameters }>(
    "/rooms/:roomId/participants/:participantId/tracks/:trackId",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["participantId", "roomId", "trackId"],
          properties: {
            participantId: { type: "string", minLength: 1, maxLength: 128 },
            roomId: { type: "string", minLength: 1, maxLength: 128 },
            trackId: { type: "string", minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) => {
      await options.engine.removeTrack(request.params);
      return reply.code(204).send();
    },
  );
  done();
};
