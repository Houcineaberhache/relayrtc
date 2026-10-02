import { describe, expect, it } from "vitest";

import { organizationOwnershipHooks } from "./ownership.js";

describe("organization ownership protection", () => {
  it("prevents removing an owner", async () => {
    await expect(
      organizationOwnershipHooks.beforeRemoveMember({ member: { role: "owner" } }),
    ).rejects.toMatchObject({
      body: {
        code: "OWNER_ROLE_PROTECTED",
        message: "Organization ownership can only be changed through ownership transfer",
      },
      status: "FORBIDDEN",
    });
  });

  it.each([
    ["owner", "viewer"],
    ["admin", "owner"],
  ])("prevents changing ownership through role updates", async (role, newRole) => {
    await expect(
      organizationOwnershipHooks.beforeUpdateMemberRole({
        member: { role },
        newRole,
      }),
    ).rejects.toMatchObject({
      body: {
        code: "OWNER_ROLE_PROTECTED",
        message: "Organization ownership can only be changed through ownership transfer",
      },
      status: "FORBIDDEN",
    });
  });

  it("allows non-owner role management", async () => {
    await expect(
      organizationOwnershipHooks.beforeUpdateMemberRole({
        member: { role: "developer" },
        newRole: "admin",
      }),
    ).resolves.toBeUndefined();
  });
});
