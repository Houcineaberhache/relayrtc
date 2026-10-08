import { createHash } from "node:crypto";

import type { RelayKitDatabase } from "@relayrtc/database";
import { describe, expect, it, vi } from "vitest";

import { authenticateApiKey } from "./api-key-service";

describe("console API key project admission", () => {
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
          from: () => ({ where: () => ({ for: () => Promise.resolve([key]) }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => Promise.resolve(status ? [{ status }] : []) }),
        });
      const update = vi.fn(() => ({
        set: () => ({ where: () => ({ returning: () => Promise.resolve([key]) }) }),
      }));
      const transaction = { select, update };
      const database = {
        transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback(transaction),
      } as unknown as RelayKitDatabase;
      const result = await authenticateApiKey(
        { database },
        {
          rawKey,
          projectId: key.projectId,
          environmentId: key.environmentId,
          requiredScope: "tokens:create",
        },
      );
      if (status === "active") {
        expect(result).toMatchObject({ id: key.id, projectId: key.projectId });
        expect(result).not.toHaveProperty("hashedSecret");
        expect(update).toHaveBeenCalledOnce();
      } else {
        expect(result).toBeNull();
        expect(update).not.toHaveBeenCalled();
      }
    },
  );
});
