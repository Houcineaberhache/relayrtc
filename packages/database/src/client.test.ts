import { describe, expect, it } from "vitest";

import { createDatabase } from "./client.js";

describe("createDatabase", () => {
  it("creates a lazy connection that can be closed without connecting", async () => {
    const connection = createDatabase("postgresql://relaykit:password@127.0.0.1:1/relaykit", {
      maxConnections: 3,
    });

    expect(connection.db).toBeDefined();
    expect(connection.client.options.max).toBe(3);

    await expect(connection.close()).resolves.toBeUndefined();
  });
});
