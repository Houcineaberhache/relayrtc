import { describe, expect, it } from "vitest";

import { generateResourceSlug } from "./resource-slug.js";

describe("generated resource slugs", () => {
  it("uses a normalized name and nine random letters or numbers", () => {
    const slug = generateResourceSlug(" Acme Inc. ", "organization");
    expect(slug).toMatch(/^acme-inc-[a-z0-9]{9}$/u);
    expect(generateResourceSlug(" Acme Inc. ", "organization")).not.toBe(slug);
  });

  it("keeps long and non-Latin names within the slug limit", () => {
    expect(generateResourceSlug("a".repeat(120), "project")).toHaveLength(80);
    expect(generateResourceSlug("東京", "project")).toMatch(/^project-[a-z0-9]{9}$/u);
  });
});
