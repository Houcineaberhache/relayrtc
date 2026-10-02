import { describe, expect, it } from "vitest";

import { listParticipantsQuerySchema, participantParamsSchema } from "./participant.schema.js";

describe("participant administration schemas", () => {
  it("applies bounded list defaults", () => {
    expect(listParticipantsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listParticipantsQuerySchema.parse({ limit: "25", status: "active" })).toEqual({
      limit: 25,
      status: "active",
    });
    expect(listParticipantsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("validates nested room and participant identifiers", () => {
    expect(
      participantParamsSchema.safeParse({
        participantId: "participant_123",
        roomId: "room_123",
      }).success,
    ).toBe(true);
    expect(
      participantParamsSchema.safeParse({
        participantId: "participant 123",
        roomId: "room_123",
      }).success,
    ).toBe(false);
  });
});
