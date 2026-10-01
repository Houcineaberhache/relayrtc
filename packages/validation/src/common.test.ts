import type { OrganizationId } from "@relayrtc/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  connectionSchema,
  isoDateTimeSchema,
  metadataSchema,
  organizationIdSchema,
  timeRangeSchema,
} from "./common.js";

describe("common schemas", () => {
  it("brands valid opaque identifiers", () => {
    const identifier = organizationIdSchema.parse("org_123");

    expect(identifier).toBe("org_123");
    expectTypeOf(identifier).toEqualTypeOf<OrganizationId>();
  });

  it("rejects empty and whitespace identifiers", () => {
    expect(organizationIdSchema.safeParse("").success).toBe(false);
    expect(organizationIdSchema.safeParse("org 123").success).toBe(false);
  });

  it("accepts RFC 3339 timestamps with offsets", () => {
    expect(isoDateTimeSchema.safeParse("2026-10-01T10:30:00Z").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-01T11:30:00+01:00").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-01").success).toBe(false);
  });

  it("validates nested JSON metadata", () => {
    const result = metadataSchema.safeParse({
      handRaised: true,
      profile: { languages: ["en", "fr"], score: 4 },
    });

    expect(result.success).toBe(true);
    expect(metadataSchema.safeParse({ value: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(metadataSchema.safeParse({ value: undefined }).success).toBe(false);
  });

  it("rejects inverted time ranges", () => {
    const result = timeRangeSchema.safeParse({
      startsAt: "2026-10-02T00:00:00Z",
      endsAt: "2026-10-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("creates strict connection schemas", () => {
    const schema = connectionSchema(organizationIdSchema);

    expect(
      schema.safeParse({
        nodes: ["org_123"],
        pageInfo: { endCursor: null, hasNextPage: false },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        nodes: ["org_123"],
        pageInfo: { endCursor: null, hasNextPage: false },
        extra: true,
      }).success,
    ).toBe(false);
  });
});
