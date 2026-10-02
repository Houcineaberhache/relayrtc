import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { participant } from "./participant.js";

describe("participant schema", () => {
  it("maps participant identity and lifecycle fields", () => {
    const columns = getTableColumns(participant);

    expect(getTableName(participant)).toBe("participant");
    expect(columns.roomId.notNull).toBe(true);
    expect(columns.joinedAt.notNull).toBe(true);
    expect(columns.leftAt.notNull).toBe(false);
  });

  it("cascades participants when their room is deleted", () => {
    const foreignKeys = getTableConfig(participant).foreignKeys;

    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
  });

  it("indexes participant room lifecycle queries", () => {
    const indexes = getTableConfig(participant).indexes;

    expect(indexes.some((index) => index.config.name === "participant_room_joined_at_idx")).toBe(
      true,
    );
    expect(indexes.some((index) => index.config.name === "participant_room_left_at_idx")).toBe(
      true,
    );
  });
});
