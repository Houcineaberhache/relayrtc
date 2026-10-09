import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const turnCredential = pgTable(
  "turn_credential",
  {
    username: text("username").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    roomId: text("room_id"),
    sessionId: text("session_id"),
    participantId: text("participant_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("turn_credential_retention_idx").on(table.expiresAt),
    check("turn_credential_check", sql`${table.expiresAt} > ${table.issuedAt}`),
    check("turn_credential_check1", sql`(${table.roomId} is null) = (${table.sessionId} is null)`),
  ],
);

export const turnLogCheckpoint = pgTable(
  "turn_log_checkpoint",
  {
    id: text("id").primaryKey(),
    byteOffset: bigint("byte_offset", { mode: "number" }).notNull().default(0),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    collectedThroughAt: timestamp("collected_through_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    rejectedObservations: bigint("rejected_observations", { mode: "number" }).notNull().default(0),
    reconciliation: jsonb("reconciliation").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [check("turn_log_checkpoint_byte_offset_check", sql`${table.byteOffset} >= 0`)],
);

export const turnAllocation = pgTable(
  "turn_allocation",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => turnLogCheckpoint.id),
    nativeId: text("native_id").notNull(),
    username: text("username")
      .notNull()
      .references(() => turnCredential.username),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    roomId: text("room_id"),
    sessionId: text("session_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    coverage: text("coverage").notNull().default("partial"),
    clientIngressBytes: bigint("client_ingress_bytes", { mode: "number" }).notNull().default(0),
    clientEgressBytes: bigint("client_egress_bytes", { mode: "number" }).notNull().default(0),
    peerIngressBytes: bigint("peer_ingress_bytes", { mode: "number" }).notNull().default(0),
    peerEgressBytes: bigint("peer_egress_bytes", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    unique("turn_allocation_source_id_native_id_key").on(table.sourceId, table.nativeId),
    index("turn_allocation_scope_time_idx").on(
      table.organizationId,
      table.projectId,
      table.environmentId,
      table.startedAt,
    ),
    index("turn_allocation_retention_idx").on(table.endedAt),
    check("turn_allocation_coverage_check", sql`${table.coverage} in ('partial', 'complete')`),
    check("turn_allocation_check", sql`${table.lastObservedAt} >= ${table.startedAt}`),
    check(
      "turn_allocation_check1",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    ...[
      table.clientIngressBytes,
      table.clientEgressBytes,
      table.peerIngressBytes,
      table.peerEgressBytes,
    ].map((column) => check(`turn_allocation_${column.name}_check`, sql`${column} >= 0`)),
  ],
);

export const turnObservation = pgTable(
  "turn_observation",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => turnLogCheckpoint.id),
    nativeId: text("native_id").notNull(),
    allocationId: text("allocation_id").references(() => turnAllocation.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    ingressBytes: bigint("ingress_bytes", { mode: "number" }).notNull().default(0),
    egressBytes: bigint("egress_bytes", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    index("turn_observation_source_time_idx").on(table.sourceId, table.occurredAt),
    index("turn_observation_allocation_idx").on(table.allocationId, table.kind, table.occurredAt),
    check(
      "turn_observation_kind_check",
      sql`${table.kind} in ('new', 'refreshed', 'deleted', 'client', 'peer')`,
    ),
    check("turn_observation_ingress_bytes_check", sql`${table.ingressBytes} >= 0`),
    check("turn_observation_egress_bytes_check", sql`${table.egressBytes} >= 0`),
  ],
);
