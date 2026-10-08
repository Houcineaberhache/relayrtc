import { verifyMediaControlToken } from "@relayrtc/protocol/media-control";
import type { RelayKitDatabase } from "@relayrtc/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import { terminateResourceRooms } from "./resource-deletion.js";

afterEach(() => vi.unstubAllGlobals());

describe("resource deletion media authorization", () => {
  it("signs console cleanup grants from persisted room scope", async () => {
    const room = {
      id: "room_1",
      projectId: "project_1",
      environmentId: "environment_1",
      status: "active",
      createdAt: new Date(),
      endedAt: null,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetch);
    const where = vi.fn().mockResolvedValue([room]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const database = {
      select: () => ({ from: () => ({ where }) }),
      update: () => ({ set: () => ({ where: updateWhere }) }),
    } as unknown as RelayKitDatabase;
    const secret = "test-media-control-secret-at-least-32-characters";

    await terminateResourceRooms(database, ["project_1"], {
      internalSecret: secret,
      mediaUrl: "http://media:8082/internal/v1",
      signalingUrl: "http://signaling:8081/internal/v1",
    });

    const mediaRequest = fetch.mock.calls.find(
      ([url]) => url === "http://media:8082/internal/v1/rooms/room_1",
    );
    expect(mediaRequest).toBeDefined();
    const authorization = new Headers(mediaRequest?.[1]?.headers).get("authorization") ?? "";
    expect(verifyMediaControlToken(secret, authorization.slice(7))).toMatchObject({
      iss: "relayrtc-console",
      method: "DELETE",
      path: "/internal/v1/rooms/room_1",
      authority: { kind: "room", roomId: room.id },
    });
    const signalingRequest = fetch.mock.calls.find(
      ([url]) => url === "http://signaling:8081/internal/v1/rooms/room_1/end",
    );
    expect(new Headers(signalingRequest?.[1]?.headers).get("authorization")).toBe(
      `Bearer ${secret}`,
    );
    expect(updateWhere).toHaveBeenCalledOnce();
  });
});
