import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { room } from "./room.js";

export const participant = pgTable(
  "participant",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    role: text("role").default("participant").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    index("participant_room_joined_at_idx").on(table.roomId, table.joinedAt),
    index("participant_room_left_at_idx").on(table.roomId, table.leftAt),
    check(
      "participant_left_at_check",
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
  ],
);

export const participantRelations = relations(participant, ({ one }) => ({
  room: one(room, {
    fields: [participant.roomId],
    references: [room.id],
  }),
}));

export const participantSession = pgTable(
  "participant_session",
  {
    id: text("id").primaryKey(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    signalingNodeId: text("signaling_node_id").notNull(),
    mediaNodeId: text("media_node_id"),
    connectionState: text("connection_state").default("connected").notNull(),
    transportType: text("transport_type").default("tcp").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    reconnectedAt: timestamp("reconnected_at", { withTimezone: true }),
    messagesIn: integer("messages_in").default(0).notNull(),
    messagesOut: integer("messages_out").default(0).notNull(),
    connectionSeconds: doublePrecision("connection_seconds").default(0).notNull(),
  },
  (table) => [
    index("participant_session_participant_id_idx").on(table.participantId),
    index("participant_session_node_state_idx").on(table.signalingNodeId, table.connectionState),
    check(
      "participant_session_connection_state_check",
      sql`${table.connectionState} in ('connecting', 'connected', 'reconnecting', 'disconnected', 'failed')`,
    ),
    check(
      "participant_session_transport_type_check",
      sql`${table.transportType} in ('udp', 'tcp', 'tls')`,
    ),
  ],
);

export const participantSessionRelations = relations(participantSession, ({ one }) => ({
  participant: one(participant, {
    fields: [participantSession.participantId],
    references: [participant.id],
  }),
}));
