import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const signalingNodeLease = pgTable(
  "signaling_node_lease",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id").notNull(),
    instanceId: text("instance_id").notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [check("signaling_node_lease_id_check", sql`${table.id} = 'owner'`)],
);
