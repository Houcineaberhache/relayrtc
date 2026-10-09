import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { room } from "./room.js";

export const mediaRoomRuntime = pgTable(
  "media_room_runtime",
  {
    roomId: text("room_id")
      .primaryKey()
      .references(() => room.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    workerId: text("worker_id").notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("media_room_runtime_node_idx").on(table.nodeId)],
);
