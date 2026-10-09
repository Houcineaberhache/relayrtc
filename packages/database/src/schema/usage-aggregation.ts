import { bigint, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const usageAggregationDirty = pgTable(
  "usage_aggregation_dirty",
  {
    organizationId: text("organization_id").notNull(),
    hourStartedAt: timestamp("hour_started_at", { withTimezone: true }).notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.hourStartedAt] }),
    index("usage_aggregation_dirty_due_idx").on(table.hourStartedAt, table.queuedAt),
  ],
);

export const usageAggregationCheckpoint = pgTable("usage_aggregation_checkpoint", {
  organizationId: text("organization_id").primaryKey(),
  scheduledThroughAt: timestamp("scheduled_through_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  processedHours: bigint("processed_hours", { mode: "number" }).notNull().default(0),
});
