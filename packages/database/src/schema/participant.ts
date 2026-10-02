import { relations, sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
