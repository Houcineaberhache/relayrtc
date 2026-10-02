import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../http/errors/api-error.js";
import type { RoomRecord, RoomRepository, RoomScope } from "./room.repository.js";
import { createRoomService } from "./room.service.js";

const scope: RoomScope = {
  environmentId: "env_development",
  projectId: "project_123",
};

const room = (overrides: Partial<RoomRecord> = {}): RoomRecord => ({
  ...scope,
  createdAt: new Date("2026-10-02T12:00:00.000Z"),
  endedAt: null,
  id: "room_123",
  maxParticipants: 100,
  metadata: {},
  name: "Daily standup",
  startedAt: null,
  status: "created",
  ...overrides,
});

const repository = (overrides: Partial<RoomRepository> = {}): RoomRepository => ({
  create: vi
    .fn<RoomRepository["create"]>()
    .mockImplementation((input) => Promise.resolve(room({ ...input }))),
  end: vi
    .fn<RoomRepository["end"]>()
    .mockResolvedValue(room({ endedAt: new Date(), status: "ended" })),
  find: vi.fn<RoomRepository["find"]>().mockResolvedValue(room()),
  list: vi.fn<RoomRepository["list"]>().mockResolvedValue([room()]),
  ...overrides,
});

describe("room service", () => {
  it("creates rooms inside the authenticated scope", async () => {
    const create = vi
      .fn<RoomRepository["create"]>()
      .mockImplementation((input) => Promise.resolve(room({ ...input })));
    const rooms = repository({ create });
    const service = createRoomService(rooms);

    const created = await service.create(scope, {
      maxParticipants: 12,
      metadata: { team: "support" },
      name: "Support room",
    });

    expect(create).toHaveBeenCalledOnce();
    const input = create.mock.calls[0]?.[0];
    expect(input?.projectId).toBe(scope.projectId);
    expect(input?.environmentId).toBe(scope.environmentId);
    expect(input?.id).toMatch(/^room_[a-f0-9]{32}$/u);
    expect(input?.maxParticipants).toBe(12);
    expect(input?.name).toBe("Support room");
    expect(created.projectId).toBe(scope.projectId);
    expect(created.environmentId).toBe(scope.environmentId);
  });

  it("returns a bounded connection and decodes its cursor", async () => {
    const first = room({ id: "room_first" });
    const second = room({
      createdAt: new Date("2026-10-02T11:00:00.000Z"),
      id: "room_second",
    });
    const list = vi
      .fn<RoomRepository["list"]>()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([]);
    const service = createRoomService(repository({ list }));

    const page = await service.list(scope, { limit: 1 });
    expect(page.nodes).toHaveLength(1);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.endCursor).not.toBeNull();
    if (!page.pageInfo.endCursor) throw new Error("Expected a pagination cursor");

    await service.list(scope, { cursor: page.pageInfo.endCursor, limit: 1 });
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { createdAt: first.createdAt, id: first.id },
      }),
    );
  });

  it("rejects invalid cursors", async () => {
    const service = createRoomService(repository());

    await expect(service.list(scope, { cursor: "invalid", limit: 50 })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
      statusCode: 400,
    } satisfies Partial<ApiError>);
  });

  it("does not reveal rooms outside the authenticated scope", async () => {
    const service = createRoomService(
      repository({ find: vi.fn<RoomRepository["find"]>().mockResolvedValue(null) }),
    );

    await expect(service.get(scope, "room_other")).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
      statusCode: 404,
    } satisfies Partial<ApiError>);
  });

  it("returns not found when a room cannot be ended", async () => {
    const service = createRoomService(
      repository({ end: vi.fn<RoomRepository["end"]>().mockResolvedValue(null) }),
    );

    await expect(service.end(scope, "room_missing")).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
      statusCode: 404,
    } satisfies Partial<ApiError>);
  });
});
