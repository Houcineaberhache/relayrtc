import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { room } from "./room.js";

export const rtcRuntime = pgTable(
  "rtc_runtime",
  {
    roomId: text("room_id")
      .primaryKey()
      .references(() => room.id, { onDelete: "cascade" }),
    state: jsonb("state").$type<Record<string, unknown>>().default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "rtc_runtime_state_check",
      sql`jsonb_typeof(${table.state}) = 'object' and octet_length(${table.state}::text) <= 8388608`,
    ),
  ],
);
