import type { Metadata } from "@relayrtc/types";

import { ApiError } from "../../http/errors/api-error.js";
import type { RoomRepository, RoomScope } from "../rooms/room.repository.js";
import type {
  ParticipantCursor,
  ParticipantRecord,
  ParticipantRepository,
} from "./participant.repository.js";
import type { ListParticipantsQuery } from "./participant.schema.js";
import type { RuntimeOperationView } from "@relayrtc/auth";

interface ParticipantResponse {
  externalId: string | null;
  id: string;
  joinedAt: string;
  leftAt: string | null;
  metadata: Metadata;
  name: string;
  role: string;
  roomId: string;
}

interface ParticipantConnection {
  nodes: readonly ParticipantResponse[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
}

interface ParticipantServiceOptions {
  clock?: () => Date;
  participantRepository: ParticipantRepository;
  roomRepository: RoomRepository;
  removeRuntime?: (participant: ParticipantRecord) => Promise<RuntimeOperationView>;
}

const toResponse = (participant: ParticipantRecord): ParticipantResponse => ({
  ...participant,
  joinedAt: participant.joinedAt.toISOString(),
  leftAt: participant.leftAt?.toISOString() ?? null,
});

const encodeCursor = (participant: ParticipantRecord): string =>
  Buffer.from(
    JSON.stringify([participant.joinedAt.toISOString(), participant.id]),
    "utf8",
  ).toString("base64url");

const decodeCursor = (cursor: string): ParticipantCursor => {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== "string" ||
      typeof value[1] !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }

    const joinedAt = new Date(value[0]);
    if (Number.isNaN(joinedAt.getTime()) || value[1].length === 0) {
      throw new Error("Invalid cursor values");
    }

    return { id: value[1], joinedAt };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "The participant list cursor is invalid");
  }
};

export const createParticipantService = (options: ParticipantServiceOptions) => {
  const requireRoom = async (scope: RoomScope, roomId: string): Promise<void> => {
    const room = await options.roomRepository.find(scope, roomId);
    if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "The room does not exist");
  };

  return {
    async get(
      scope: RoomScope,
      roomId: string,
      participantId: string,
    ): Promise<ParticipantResponse> {
      await requireRoom(scope, roomId);
      const participant = await options.participantRepository.find(roomId, participantId);
      if (!participant) {
        throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "The participant does not exist");
      }
      return toResponse(participant);
    },

    async list(
      scope: RoomScope,
      roomId: string,
      query: ListParticipantsQuery,
    ): Promise<ParticipantConnection> {
      await requireRoom(scope, roomId);
      const participants = await options.participantRepository.list({
        ...(query.cursor ? { cursor: decodeCursor(query.cursor) } : {}),
        limit: query.limit,
        roomId,
        ...(query.status ? { status: query.status } : {}),
      });
      const hasNextPage = participants.length > query.limit;
      const nodes = participants.slice(0, query.limit);
      const lastParticipant = nodes.at(-1);

      return {
        nodes: nodes.map(toResponse),
        pageInfo: {
          endCursor: hasNextPage && lastParticipant ? encodeCursor(lastParticipant) : null,
          hasNextPage,
        },
      };
    },

    async remove(
      scope: RoomScope,
      roomId: string,
      participantId: string,
    ): Promise<RuntimeOperationView | undefined> {
      await requireRoom(scope, roomId);
      const removed = await options.participantRepository.remove(
        roomId,
        participantId,
        options.clock?.() ?? new Date(),
      );
      if (!removed) {
        throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "The participant does not exist");
      }
      return options.removeRuntime?.(removed);
    },
  };
};
