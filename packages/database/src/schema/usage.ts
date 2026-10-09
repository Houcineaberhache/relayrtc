import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./organization.js";
import { environment, project } from "./project.js";
import { room } from "./room.js";

export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    roomId: text("room_id"),
    region: text("region"),
    metric: text("metric").notNull(),
    source: text("source").notNull().default("legacy"),
    value: doublePrecision("value").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("usage_event_scope_time_idx").on(
      table.organizationId,
      table.projectId,
      table.environmentId,
      table.occurredAt,
    ),
    index("usage_event_room_time_idx").on(table.roomId, table.occurredAt),
    index("usage_event_retention_idx").on(table.occurredAt),
    check("usage_event_value_check", sql`${table.value} >= 0`),
  ],
);

export const usageAggregate = pgTable(
  "usage_aggregate",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id"),
    environmentId: text("environment_id"),
    granularity: text("granularity").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    windowEndedAt: timestamp("window_ended_at", { withTimezone: true }).notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().default({}).notNull(),
    sourceThroughAt: timestamp("source_through_at", { withTimezone: true }),
    dataQuality: jsonb("data_quality").$type<Record<string, string>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("usage_aggregate_scope_window_idx").on(
      table.organizationId,
      table.projectId,
      table.environmentId,
      table.granularity,
      table.windowStartedAt,
    ),
    unique("usage_aggregate_canonical_scope_idx")
      .on(
        table.organizationId,
        table.projectId,
        table.environmentId,
        table.granularity,
        table.windowStartedAt,
      )
      .nullsNotDistinct(),
    index("usage_aggregate_organization_window_idx").on(
      table.organizationId,
      table.granularity,
      table.windowStartedAt,
    ),
    index("usage_aggregate_retention_idx").on(table.windowEndedAt),
    check(
      "usage_aggregate_granularity_check",
      sql`${table.granularity} in ('hour', 'day', 'month')`,
    ),
  ],
);

export const usageEventRelations = relations(usageEvent, ({ one }) => ({
  environment: one(environment, {
    fields: [usageEvent.environmentId],
    references: [environment.id],
  }),
  organization: one(organization, {
    fields: [usageEvent.organizationId],
    references: [organization.id],
  }),
  project: one(project, { fields: [usageEvent.projectId], references: [project.id] }),
  room: one(room, { fields: [usageEvent.roomId], references: [room.id] }),
}));
