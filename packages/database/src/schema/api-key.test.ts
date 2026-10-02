import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { apiKey } from "./api-key.js";

describe("API key schema", () => {
  it("stores only hashed environment-scoped credentials", () => {
    const columns = getTableColumns(apiKey);

    expect(getTableName(apiKey)).toBe("api_key");
    expect(columns.projectId.notNull).toBe(true);
    expect(columns.environmentId.notNull).toBe(true);
    expect(columns.hashedSecret.notNull).toBe(true);
    expect(columns).not.toHaveProperty("secret");
  });

  it("enforces the project and environment pair", () => {
    const foreignKeys = getTableConfig(apiKey).foreignKeys;

    expect(
      foreignKeys.some(
        (foreignKey) =>
          foreignKey.getName() === "api_key_environment_project_fk" &&
          foreignKey.onDelete === "cascade",
      ),
    ).toBe(true);
  });

  it("indexes unique prefixes and hashes", () => {
    const indexes = getTableConfig(apiKey).indexes;

    expect(indexes.some((index) => index.config.name === "api_key_prefix_idx" && index.config.unique))
      .toBe(true);
    expect(
      indexes.some(
        (index) => index.config.name === "api_key_hashed_secret_idx" && index.config.unique,
      ),
    ).toBe(true);
  });
});
