import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { account, session, user, verification } from "./auth.js";

describe("Better Auth schema", () => {
  it.each([
    [user, "user"],
    [session, "session"],
    [account, "account"],
    [verification, "verification"],
  ])("maps a core model to the expected table", (table, name) => {
    expect(getTableName(table)).toBe(name);
  });

  it("keeps session ownership required and cascading", () => {
    const userId = getTableColumns(session).userId;
    const foreignKey = getTableConfig(session).foreignKeys[0];

    expect(userId.notNull).toBe(true);
    expect(foreignKey?.onDelete).toBe("cascade");
  });

  it("keeps account ownership required and cascading", () => {
    const userId = getTableColumns(account).userId;
    const foreignKey = getTableConfig(account).foreignKeys[0];

    expect(userId.notNull).toBe(true);
    expect(foreignKey?.onDelete).toBe("cascade");
  });
});
