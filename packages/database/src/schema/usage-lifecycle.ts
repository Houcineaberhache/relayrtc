import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usageLifecycleEvent = pgTable(
  "usage_lifecycle_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    roomId: text("room_id").notNull(),
    sessionId: text("session_id"),
    participantId: text("participant_id"),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    boundary: text("boundary").notNull().default("observed"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_lifecycle_scope_time_idx").on(
      table.organizationId,
      table.projectId,
      table.environmentId,
      table.occurredAt,
    ),
    index("usage_lifecycle_retention_idx").on(table.occurredAt),
    check(
      "usage_lifecycle_event_event_type_check",
      sql`${table.eventType} in ('room.created', 'room.started', 'room.ended', 'session.created', 'connection.opened', 'connection.closed', 'participant.left')`,
    ),
    check(
      "usage_lifecycle_event_boundary_check",
      sql`${table.boundary} in ('observed', 'lease_bound', 'legacy')`,
    ),
  ],
);
