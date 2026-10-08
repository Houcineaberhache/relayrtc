import { createHash } from "node:crypto";

import type { RelayKitDatabase } from "@relayrtc/database";
import { describe, expect, it, vi } from "vitest";

import { authenticateApiKey } from "./api-key-authenticator.js";

describe("project status API key authentication", () => {
  it.each(["active", "suspended", "deleting", "deleted", undefined])(
    "authenticates only active projects: %s",
    async (status) => {
      const rawKey = `rk_sk_development_${"a".repeat(43)}`;
      const key = {
        id: "key_1",
        environmentId: "env_1",
        projectId: "project_1",
        type: "secret",
        scopes: ["tokens:create"],
        revokedAt: null,
        expiresAt: null,
        hashedSecret: createHash("sha256").update(rawKey).digest("hex"),
      };
      const select = vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([key]) }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => Promise.resolve(status ? [{ status }] : []) }),
        });
      const update = vi.fn(() => ({
        set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: key.id }]) }) }),
      }));
      const database = { select, update } as unknown as RelayKitDatabase;
      const principal = await authenticateApiKey(database, rawKey);
      if (status === "active") {
        expect(principal).toMatchObject({ projectId: key.projectId, keyId: key.id });
        expect(update).toHaveBeenCalledOnce();
      } else {
        expect(principal).toBeNull();
        expect(update).not.toHaveBeenCalled();
      }
    },
  );
});
