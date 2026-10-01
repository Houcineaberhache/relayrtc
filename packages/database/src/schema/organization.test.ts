import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { invitation, member, organization } from "./organization.js";

describe("organization schema", () => {
  it("maps organizations and memberships to Better Auth models", () => {
    expect(getTableName(organization)).toBe("organization");
    expect(getTableName(member)).toBe("member");
    expect(getTableName(invitation)).toBe("invitation");
  });

  it("requires organization ownership and cascades memberships", () => {
    const columns = getTableColumns(member);
    const foreignKeys = getTableConfig(member).foreignKeys;

    expect(columns.organizationId.notNull).toBe(true);
    expect(columns.userId.notNull).toBe(true);
    expect(foreignKeys).toHaveLength(2);
    expect(foreignKeys.every((foreignKey) => foreignKey.onDelete === "cascade")).toBe(true);
  });

  it("keeps organization slugs unique", () => {
    expect(getTableColumns(organization).slug.isUnique).toBe(true);
  });

  it("cascades pending invitations with their organization", () => {
    const foreignKeys = getTableConfig(invitation).foreignKeys;

    expect(foreignKeys).toHaveLength(2);
    expect(foreignKeys.every((foreignKey) => foreignKey.onDelete === "cascade")).toBe(true);
  });
});
