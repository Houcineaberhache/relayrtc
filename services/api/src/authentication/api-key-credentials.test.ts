import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { apiKeyHashMatches, apiKeyPrefixFromRaw } from "./api-key-credentials.js";

const rawKey = `rk_sk_dev_${"a".repeat(43)}`;

describe("API key credentials", () => {
  it("extracts the stored lookup prefix", () => {
    expect(apiKeyPrefixFromRaw(rawKey)).toBe(`rk_sk_dev_${"a".repeat(12)}`);
    expect(apiKeyPrefixFromRaw("not-a-key")).toBeNull();
  });

  it("compares the raw credential against its hash", () => {
    const hash = createHash("sha256").update(rawKey).digest("hex");

    expect(apiKeyHashMatches(rawKey, hash)).toBe(true);
    expect(apiKeyHashMatches(`${rawKey}x`, hash)).toBe(false);
  });
});
