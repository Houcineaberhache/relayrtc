import { describe, expect, it } from "vitest";

import {
  qualityModeSettingsSchema,
  roomQualityModeSchema,
  videoQualityPreferenceSchema,
} from "./quality.js";

describe("quality schemas", () => {
  it("accepts supported room quality modes", () => {
    expect(roomQualityModeSchema.parse("auto")).toBe("auto");
    expect(roomQualityModeSchema.parse("data-saver")).toBe("data-saver");
    expect(roomQualityModeSchema.safeParse("ultra").success).toBe(false);
  });

  it("validates granular send and receive settings", () => {
    expect(
      qualityModeSettingsSchema.parse({ receive: "360p", send: "720p" }),
    ).toEqual({ receive: "360p", send: "720p" });
    expect(videoQualityPreferenceSchema.safeParse("144p").success).toBe(false);
  });
});
