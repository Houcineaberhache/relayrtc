import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usageHistoryOrganization = pgTable("usage_history_organization", {
  id: text("id").primaryKey(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const usageHistoryProject = pgTable("usage_history_project", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [index("usage_history_project_organization_idx").on(table.organizationId)]);

export const usageHistoryEnvironment = pgTable("usage_history_environment", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [index("usage_history_environment_project_idx").on(table.projectId)]);

export const usageHistoryRoom = pgTable("usage_history_room", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  environmentId: text("environment_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [index("usage_history_room_scope_time_idx").on(table.organizationId, table.projectId, table.environmentId, table.createdAt)]);

export const usageHistorySession = pgTable("usage_history_session", {
  id: text("id").primaryKey(),
  participantId: text("participant_id").notNull(),
  roomId: text("room_id").notNull(),
  country: text("country"),
  connectionState: text("connection_state").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  meteringStartedAt: timestamp("metering_started_at", { withTimezone: true }).notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [index("usage_history_session_room_idx").on(table.roomId), index("usage_history_session_participant_idx").on(table.participantId)]);

export const usageHistoryInterval = pgTable("usage_history_interval", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (table) => [index("usage_history_interval_session_time_idx").on(table.sessionId, table.startedAt), index("usage_history_interval_retention_idx").on(table.endedAt), check("usage_history_interval_time_check", sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`)]);
