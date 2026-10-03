import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { rtcQualityMetric } from "./quality.js";

describe("RTC quality metric schema", () => {
  it("stores minute aggregates by room and participant", () => {
    const columns = getTableColumns(rtcQualityMetric);
    const config = getTableConfig(rtcQualityMetric);

    expect(getTableName(rtcQualityMetric)).toBe("rtc_quality_metric");
    expect(config.primaryKeys).toHaveLength(1);
    expect(columns.sampleCount.notNull).toBe(true);
    expect(columns.latestQuality.notNull).toBe(true);
    expect(columns.worstQualitySeverity.notNull).toBe(true);
  });

  it("cascades aggregates and indexes time-bucket queries", () => {
    const config = getTableConfig(rtcQualityMetric);

    expect(config.foreignKeys.every((foreignKey) => foreignKey.onDelete === "cascade")).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual([
      "rtc_quality_metric_participant_bucket_idx",
      "rtc_quality_metric_room_bucket_idx",
    ]);
  });
});
