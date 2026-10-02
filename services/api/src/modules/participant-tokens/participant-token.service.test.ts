import { describe, expect, it, vi } from "vitest";

import type { RoomRecord, RoomRepository, RoomScope } from "../rooms/room.repository.js";
import { createParticipantTokenService } from "./participant-token.service.js";
import type { ParticipantTokenClaims, ParticipantTokenSigner } from "./participant-token.signer.js";

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

const repository = (found: RoomRecord | null): RoomRepository => ({
  create: vi.fn<RoomRepository["create"]>(),
  end: vi.fn<RoomRepository["end"]>(),
  find: vi.fn<RoomRepository["find"]>().mockResolvedValue(found),
  list: vi.fn<RoomRepository["list"]>(),
});

describe("participant token service", () => {
  it("issues a room-scoped token with a fixed expiration", async () => {
    let signedClaims: ParticipantTokenClaims | null = null;
    const signer: ParticipantTokenSigner = {
      sign: (claims) => {
        signedClaims = claims;
        return Promise.resolve("signed-token");
      },
    };
    const ids = ["participant-id", "token-id"];
    const service = createParticipantTokenService({
      clock: () => new Date("2026-10-02T12:00:00.000Z"),
      createId: () => ids.shift() ?? "missing-id",
      roomRepository: repository(room()),
      signer,
    });

    const result = await service.create(scope, "room_123", {
      metadata: { role: "host" },
      participantName: "Ada",
      permissions: ["room:join", "audio:publish"],
      ttlSeconds: 600,
    });

    expect(result).toEqual({
      expiresAt: "2026-10-02T12:10:00.000Z",
      participantId: "participant_participant-id",
      token: "signed-token",
      tokenId: "ptok_token-id",
    });
    expect(signedClaims).toMatchObject({
      ...scope,
      roomId: "room_123",
      participantId: "participant_participant-id",
      tokenId: "ptok_token-id",
    });
  });

  it("does not issue tokens for rooms outside the key scope", async () => {
    const service = createParticipantTokenService({
      roomRepository: repository(null),
      signer: { sign: vi.fn<ParticipantTokenSigner["sign"]>() },
    });

    await expect(
      service.create(scope, "room_other", {
        metadata: {},
        participantName: "Ada",
        permissions: ["room:join"],
        ttlSeconds: 600,
      }),
    ).rejects.toMatchObject({ code: "ROOM_NOT_FOUND", statusCode: 404 });
  });

  it.each(["ending", "ended", "failed"] as const)(
    "does not issue tokens for %s rooms",
    async (status) => {
      const service = createParticipantTokenService({
        roomRepository: repository(room({ status })),
        signer: { sign: vi.fn<ParticipantTokenSigner["sign"]>() },
      });

      await expect(
        service.create(scope, "room_123", {
          metadata: {},
          participantName: "Ada",
          permissions: ["room:join"],
          ttlSeconds: 600,
        }),
      ).rejects.toMatchObject({ code: "ROOM_NOT_JOINABLE", statusCode: 409 });
    },
  );
});
