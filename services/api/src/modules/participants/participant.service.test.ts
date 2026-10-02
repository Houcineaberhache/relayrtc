import { describe, expect, it, vi } from "vitest";

import type { RoomRecord, RoomRepository, RoomScope } from "../rooms/room.repository.js";
import type { ParticipantRecord, ParticipantRepository } from "./participant.repository.js";
import { createParticipantService } from "./participant.service.js";

const scope: RoomScope = {
  environmentId: "env_development",
  projectId: "project_123",
};

const room: RoomRecord = {
  ...scope,
  createdAt: new Date("2026-10-02T12:00:00.000Z"),
  endedAt: null,
  id: "room_123",
  maxParticipants: 100,
  metadata: {},
  name: "Daily standup",
  startedAt: null,
  status: "active",
};

const participant = (overrides: Partial<ParticipantRecord> = {}): ParticipantRecord => ({
  externalId: null,
  id: "participant_123",
  joinedAt: new Date("2026-10-02T12:05:00.000Z"),
  leftAt: null,
  metadata: {},
  name: "Ada",
  role: "participant",
  roomId: room.id,
  ...overrides,
});

const roomRepository = (found: RoomRecord | null = room): RoomRepository => ({
  create: vi.fn<RoomRepository["create"]>(),
  end: vi.fn<RoomRepository["end"]>(),
  find: vi.fn<RoomRepository["find"]>().mockResolvedValue(found),
  list: vi.fn<RoomRepository["list"]>(),
});

const participantRepository = (
  overrides: Partial<ParticipantRepository> = {},
): ParticipantRepository => ({
  find: vi.fn<ParticipantRepository["find"]>().mockResolvedValue(participant()),
  list: vi.fn<ParticipantRepository["list"]>().mockResolvedValue([participant()]),
  remove: vi.fn<ParticipantRepository["remove"]>().mockResolvedValue(participant()),
  ...overrides,
});

describe("participant administration service", () => {
  it("gets participants only after validating the room scope", async () => {
    const findRoom = vi.fn<RoomRepository["find"]>().mockResolvedValue(room);
    const findParticipant = vi
      .fn<ParticipantRepository["find"]>()
      .mockResolvedValue(participant());
    const rooms = { ...roomRepository(), find: findRoom };
    const participants = { ...participantRepository(), find: findParticipant };
    const service = createParticipantService({
      participantRepository: participants,
      roomRepository: rooms,
    });

    const result = await service.get(scope, room.id, "participant_123");

    expect(result).toMatchObject({ id: "participant_123", roomId: room.id });
    expect(findRoom).toHaveBeenCalledWith(scope, room.id);
    expect(findParticipant).toHaveBeenCalledWith(room.id, "participant_123");
  });

  it("does not query participants when the room is outside scope", async () => {
    const findParticipant = vi.fn<ParticipantRepository["find"]>();
    const participants = { ...participantRepository(), find: findParticipant };
    const service = createParticipantService({
      participantRepository: participants,
      roomRepository: roomRepository(null),
    });

    await expect(service.get(scope, "room_other", "participant_123")).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
      statusCode: 404,
    });
    expect(findParticipant).not.toHaveBeenCalled();
  });

  it("returns a cursor-paginated participant connection", async () => {
    const first = participant({ id: "participant_first" });
    const second = participant({
      id: "participant_second",
      joinedAt: new Date("2026-10-02T12:04:00.000Z"),
    });
    const list = vi
      .fn<ParticipantRepository["list"]>()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([]);
    const service = createParticipantService({
      participantRepository: participantRepository({ list }),
      roomRepository: roomRepository(),
    });

    const page = await service.list(scope, room.id, { limit: 1 });
    expect(page.nodes).toHaveLength(1);
    expect(page.pageInfo.hasNextPage).toBe(true);
    if (!page.pageInfo.endCursor) throw new Error("Expected a pagination cursor");

    await service.list(scope, room.id, { cursor: page.pageInfo.endCursor, limit: 1 });
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: first.id, joinedAt: first.joinedAt },
        roomId: room.id,
      }),
    );
  });

  it("marks removals with a stable server timestamp", async () => {
    const remove = vi.fn<ParticipantRepository["remove"]>().mockResolvedValue(participant());
    const service = createParticipantService({
      clock: () => new Date("2026-10-02T12:10:00.000Z"),
      participantRepository: participantRepository({ remove }),
      roomRepository: roomRepository(),
    });

    await service.remove(scope, room.id, "participant_123");
    expect(remove).toHaveBeenCalledWith(
      room.id,
      "participant_123",
      new Date("2026-10-02T12:10:00.000Z"),
    );
  });

  it("returns not found for missing participants", async () => {
    const service = createParticipantService({
      participantRepository: participantRepository({
        remove: vi.fn<ParticipantRepository["remove"]>().mockResolvedValue(null),
      }),
      roomRepository: roomRepository(),
    });

    await expect(service.remove(scope, room.id, "participant_missing")).rejects.toMatchObject({
      code: "PARTICIPANT_NOT_FOUND",
      statusCode: 404,
    });
  });
});
