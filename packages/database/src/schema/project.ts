import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization } from "./organization.js";

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("project_organization_id_idx").on(table.organizationId),
    index("project_status_idx").on(table.status),
    uniqueIndex("project_organization_slug_idx").on(table.organizationId, table.slug),
    check(
      "project_status_check",
      sql`${table.status} in ('active', 'suspended', 'deleting', 'deleted')`,
    ),
  ],
);

export const environment = pgTable(
  "environment",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("environment_project_id_idx").on(table.projectId),
    index("environment_type_idx").on(table.type),
    uniqueIndex("environment_project_slug_idx").on(table.projectId, table.slug),
    check(
      "environment_type_check",
      sql`${table.type} in ('development', 'production', 'preview', 'staging', 'custom')`,
    ),
  ],
);

export const projectRelations = relations(project, ({ many, one }) => ({
  environments: many(environment),
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
}));

export const environmentRelations = relations(environment, ({ one }) => ({
  project: one(project, {
    fields: [environment.projectId],
    references: [project.id],
  }),
}));
