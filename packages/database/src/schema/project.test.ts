import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { environment, project } from "./project.js";

describe("project schema", () => {
  it("maps projects and environments", () => {
    expect(getTableName(project)).toBe("project");
    expect(getTableName(environment)).toBe("environment");
  });

  it("scopes project slugs to organizations", () => {
    const indexes = getTableConfig(project).indexes;

    expect(
      indexes.some(
        (index) => index.config.name === "project_organization_slug_idx" && index.config.unique,
      ),
    ).toBe(true);
  });

  it("cascades environments when their project is deleted", () => {
    const columns = getTableColumns(environment);
    const foreignKeys = getTableConfig(environment).foreignKeys;

    expect(columns.projectId.notNull).toBe(true);
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
  });

  it("protects the required Development and Production environments", () => {
    const columns = getTableColumns(environment);
    const checks = getTableConfig(environment).checks;

    expect(columns.deletionProtected.notNull).toBe(true);
    expect(
      checks.some((constraint) => constraint.name === "environment_defaults_protected_check"),
    ).toBe(true);
  });

  it("cascades projects when their organization is deleted", () => {
    const foreignKeys = getTableConfig(project).foreignKeys;

    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
  });
});
