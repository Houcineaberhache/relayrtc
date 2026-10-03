import { describe, expect, it } from "vitest";

import { selectVideoQuality, type SubscriberNetworkStats } from "./quality-controller.js";

const stats = (overrides: Partial<SubscriberNetworkStats> = {}): SubscriberNetworkStats => ({
  availableIncomingBitrate: 4_000_000,
  jitter: 0.01,
  packetsLost: 1,
  packetsReceived: 999,
  roundTripTime: 0.05,
  timestamp: 1,
  ...overrides,
});

describe("selectVideoQuality", () => {
  it("selects all fallback levels from subscriber conditions", () => {
    expect(selectVideoQuality(stats(), "normal")).toBe("1080p");
    expect(selectVideoQuality(stats({ availableIncomingBitrate: 1_200_000 }), "normal")).toBe(
      "720p",
    );
    expect(selectVideoQuality(stats({ availableIncomingBitrate: 400_000 }), "normal")).toBe("360p");
    expect(selectVideoQuality(stats({ availableIncomingBitrate: 70_000 }), "normal")).toBe(
      "audio-only",
    );
  });

  it("uses priority to adjust allocation thresholds", () => {
    const constrained = stats({ availableIncomingBitrate: 800_000 });
    expect(selectVideoQuality(constrained, "high")).toBe("720p");
    expect(selectVideoQuality(constrained, "low")).toBe("360p");
  });

  it("falls back to audio for severe packet loss", () => {
    expect(selectVideoQuality(stats({ packetsLost: 25, packetsReceived: 75 }), "high")).toBe(
      "audio-only",
    );
  });

  it("uses a safe video layer when the browser omits bandwidth estimates", () => {
    expect(selectVideoQuality(stats({ availableIncomingBitrate: null }), "normal")).toBe("720p");
    expect(
      selectVideoQuality(
        stats({ availableIncomingBitrate: null, packetsLost: 10, packetsReceived: 90 }),
        "normal",
      ),
    ).toBe("360p");
  });
});
