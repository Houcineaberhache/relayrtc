import { index, jsonb, pgTable, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const mediaUsageSample = pgTable(
  "media_usage_sample",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("media_usage_sample_retention_idx").on(table.occurredAt),
    check("media_usage_sample_metrics_check", sql`jsonb_typeof(${table.metrics}) = 'object'`),
  ],
);
