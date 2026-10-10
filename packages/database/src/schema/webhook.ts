import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { environment, project } from "./project.js";

export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").notNull(),
    url: text("url").notNull(),
    eventTypes: text("event_types").array().notNull(),
    status: text("status").default("enabled").notNull(),
    encryptedSigningSecret: text("encrypted_signing_secret").notNull(),
    signingSecretVersion: integer("signing_secret_version").default(1).notNull(),
    signingSecretRotatedAt: timestamp("signing_secret_rotated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.environmentId, table.projectId],
      foreignColumns: [environment.id, environment.projectId],
      name: "webhook_endpoint_environment_project_fk",
    }).onDelete("cascade"),
    index("webhook_endpoint_scope_idx")
      .on(table.projectId, table.environmentId, table.createdAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    check("webhook_endpoint_url_check", sql`length(${table.url}) <= 2048`),
    check("webhook_endpoint_status_check", sql`${table.status} in ('enabled', 'disabled')`),
    check("webhook_endpoint_secret_version_check", sql`${table.signingSecretVersion} > 0`),
    check(
      "webhook_endpoint_events_check",
      sql`cardinality(${table.eventTypes}) between 1 and 10 and ${table.eventTypes} <@ ARRAY['room.created', 'room.started', 'room.ended', 'participant.joined', 'participant.left', 'participant.reconnected', 'track.published', 'track.unpublished', 'connection.degraded', 'connection.recovered']::text[] and array_position(${table.eventTypes}, NULL) is null`,
    ),
    check(
      "webhook_endpoint_deleted_check",
      sql`${table.deletedAt} is null or ${table.status} = 'disabled'`,
    ),
  ],
);
