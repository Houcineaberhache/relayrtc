import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { environment, project } from "./project.js";

export const room = pgTable(
  "room",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status").default("created").notNull(),
    maxParticipants: integer("max_participants").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("room_project_environment_created_at_idx").on(
      table.projectId,
      table.environmentId,
      table.createdAt,
    ),
    index("room_project_environment_status_idx").on(
      table.projectId,
      table.environmentId,
      table.status,
    ),
    foreignKey({
      columns: [table.environmentId, table.projectId],
      foreignColumns: [environment.id, environment.projectId],
      name: "room_environment_project_fk",
    }).onDelete("cascade"),
    check(
      "room_status_check",
      sql`${table.status} in ('created', 'active', 'ending', 'ended', 'failed')`,
    ),
    check("room_max_participants_check", sql`${table.maxParticipants} > 0`),
    check(
      "room_ended_at_check",
      sql`(${table.status} = 'ended' and ${table.endedAt} is not null) or (${table.status} <> 'ended')`,
    ),
  ],
);

export const roomRelations = relations(room, ({ one }) => ({
  environment: one(environment, {
    fields: [room.environmentId, room.projectId],
    references: [environment.id, environment.projectId],
  }),
  project: one(project, {
    fields: [room.projectId],
    references: [project.id],
  }),
}));
