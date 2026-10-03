import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { participant } from "./participant.js";
import { room } from "./room.js";

export const rtcQualityMetric = pgTable(
  "rtc_quality_metric",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    bucketStartedAt: timestamp("bucket_started_at", { withTimezone: true }).notNull(),
    sampleCount: integer("sample_count").default(0).notNull(),
    bitrateSampleCount: integer("bitrate_sample_count").default(0).notNull(),
    incomingBitrateSum: doublePrecision("incoming_bitrate_sum").default(0).notNull(),
    jitterSampleCount: integer("jitter_sample_count").default(0).notNull(),
    jitterSum: doublePrecision("jitter_sum").default(0).notNull(),
    roundTripTimeSampleCount: integer("round_trip_time_sample_count").default(0).notNull(),
    roundTripTimeSum: doublePrecision("round_trip_time_sum").default(0).notNull(),
    packetsLost: integer("packets_lost").default(0).notNull(),
    packetsReceived: integer("packets_received").default(0).notNull(),
    latestQuality: text("latest_quality").notNull(),
    worstQuality: text("worst_quality").notNull(),
    worstQualitySeverity: integer("worst_quality_severity").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.participantId, table.bucketStartedAt] }),
    index("rtc_quality_metric_participant_bucket_idx").on(
      table.participantId,
      table.bucketStartedAt,
    ),
    index("rtc_quality_metric_room_bucket_idx").on(table.roomId, table.bucketStartedAt),
    check("rtc_quality_metric_sample_count_check", sql`${table.sampleCount} > 0`),
    check(
      "rtc_quality_metric_quality_check",
      sql`${table.latestQuality} in ('excellent', 'good', 'poor', 'critical', 'lost') and ${table.worstQuality} in ('excellent', 'good', 'poor', 'critical', 'lost')`,
    ),
  ],
);

export const rtcQualityMetricRelations = relations(rtcQualityMetric, ({ one }) => ({
  participant: one(participant, {
    fields: [rtcQualityMetric.participantId],
    references: [participant.id],
  }),
  room: one(room, {
    fields: [rtcQualityMetric.roomId],
    references: [room.id],
  }),
}));
