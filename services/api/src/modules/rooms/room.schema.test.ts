import { describe, expect, it } from "vitest";

import { createRoomBodySchema, listRoomsQuerySchema, roomParamsSchema } from "./room.schema.js";

describe("room request schemas", () => {
  it("normalizes room creation defaults", () => {
    expect(createRoomBodySchema.parse({ name: "  Daily standup  " })).toEqual({
      maxParticipants: 100,
      metadata: {},
      name: "Daily standup",
    });
  });

  it("rejects unsupported creation fields and invalid capacity", () => {
    expect(createRoomBodySchema.safeParse({ name: "Room", maxParticipants: 0 }).success).toBe(
      false,
    );
    expect(createRoomBodySchema.safeParse({ name: "Room", projectId: "project_other" }).success).toBe(
      false,
    );
  });

  it("bounds list pagination and validates room identifiers", () => {
    expect(listRoomsQuerySchema.parse({ limit: "25", status: "active" })).toEqual({
      limit: 25,
      status: "active",
    });
    expect(listRoomsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(roomParamsSchema.safeParse({ roomId: "room_123" }).success).toBe(true);
    expect(roomParamsSchema.safeParse({ roomId: "room 123" }).success).toBe(false);
  });
});
