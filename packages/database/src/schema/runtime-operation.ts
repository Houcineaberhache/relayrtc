import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const runtimeOperation = pgTable(
  "runtime_operation",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    resourceId: text("resource_id").notNull(),
    organizationId: text("organization_id"),
    projectId: text("project_id"),
    environmentId: text("environment_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("runtime_operation_due_idx").on(table.status, table.availableAt),
    index("runtime_operation_project_idx").on(table.projectId),
    index("runtime_operation_organization_idx").on(table.organizationId),
    check(
      "runtime_operation_status_check",
      sql`${table.status} in ('pending', 'running', 'failed', 'completed')`,
    ),
    check(
      "runtime_operation_kind_check",
      sql`${table.kind} in ('room.end', 'project.delete', 'organization.delete', 'environment.delete')`,
    ),
    check("runtime_operation_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
