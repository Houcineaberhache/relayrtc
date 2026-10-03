import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomRecord } from "./room.repository.js";
import { createRoomRuntimeService } from "./room-runtime.service.js";

const room: RoomRecord = {
  createdAt: new Date("2026-10-03T00:00:00Z"),
  endedAt: new Date("2026-10-03T01:00:00Z"),
  environmentId: "env_123",
  id: "room_123",
  maxParticipants: 10,
  metadata: {},
  name: "Room",
  projectId: "project_123",
  startedAt: new Date("2026-10-03T00:05:00Z"),
  status: "ended",
};

afterEach(() => vi.unstubAllGlobals());

describe("room runtime service", () => {
  it("terminates signaling sessions and media resources", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetch);
    const runtime = createRoomRuntimeService({
      internalSecret: "a-secure-internal-service-secret-123",
      mediaUrl: "http://media/internal/v1",
      signalingUrl: "http://signaling/internal/v1",
    });

    await runtime.end(room);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      "http://signaling/internal/v1/rooms/room_123/end",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://media/internal/v1/rooms/room_123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
