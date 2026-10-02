import { describe, expect, it } from "vitest";

import { createParticipantTokenBodySchema } from "./participant-token.schema.js";

describe("participant token request schema", () => {
  it("applies least-privilege and short-lived defaults", () => {
    expect(createParticipantTokenBodySchema.parse({ participantName: "  Ada  " })).toEqual({
      metadata: {},
      participantName: "Ada",
      permissions: ["room:join"],
      ttlSeconds: 600,
    });
  });

  it("requires join permission and unique known permissions", () => {
    expect(
      createParticipantTokenBodySchema.safeParse({
        participantName: "Ada",
        permissions: ["audio:publish"],
      }).success,
    ).toBe(false);
    expect(
      createParticipantTokenBodySchema.safeParse({
        participantName: "Ada",
        permissions: ["room:join", "room:join"],
      }).success,
    ).toBe(false);
    expect(
      createParticipantTokenBodySchema.safeParse({
        participantName: "Ada",
        permissions: ["room:join", "admin:all"],
      }).success,
    ).toBe(false);
  });

  it("limits token lifetime to one hour", () => {
    expect(
      createParticipantTokenBodySchema.safeParse({ participantName: "Ada", ttlSeconds: 59 })
        .success,
    ).toBe(false);
    expect(
      createParticipantTokenBodySchema.safeParse({ participantName: "Ada", ttlSeconds: 3_601 })
        .success,
    ).toBe(false);
  });
});
