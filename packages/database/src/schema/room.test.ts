import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { room } from "./room.js";

describe("room schema", () => {
  it("maps rooms with required lifecycle fields", () => {
    const columns = getTableColumns(room);

    expect(getTableName(room)).toBe("room");
    expect(columns.projectId.notNull).toBe(true);
    expect(columns.environmentId.notNull).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.maxParticipants.notNull).toBe(true);
  });

  it("scopes rooms to a project and environment", () => {
    const foreignKeys = getTableConfig(room).foreignKeys;

    expect(
      foreignKeys.some((foreignKey) => foreignKey.getName() === "room_environment_project_fk"),
    ).toBe(true);
  });

  it("cascades rooms when their project or environment is deleted", () => {
    const foreignKeys = getTableConfig(room).foreignKeys;

    expect(foreignKeys).toHaveLength(2);
    expect(foreignKeys.every((foreignKey) => foreignKey.onDelete === "cascade")).toBe(true);
  });
});
