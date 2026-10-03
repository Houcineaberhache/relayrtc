import { describe, expect, it } from "vitest";

import { normalizeRtcStats, simulcastEncodings } from "./quality.js";

describe("RTC auto quality", () => {
  it("defines low-to-high simulcast encodings", () => {
    expect(simulcastEncodings.map((encoding) => encoding.rid)).toEqual(["q", "h", "f"]);
    expect(simulcastEncodings.map((encoding) => encoding.scaleResolutionDownBy)).toEqual([
      3, 1.5, 1,
    ]);
  });

  it("normalizes transport and RTP stats", () => {
    const entries = new Map<string, Record<string, unknown>>([
      [
        "pair",
        {
          type: "candidate-pair",
          state: "succeeded",
          timestamp: 10,
          availableIncomingBitrate: 2_000_000,
          availableOutgoingBitrate: 1_000_000,
          currentRoundTripTime: 0.1,
        },
      ],
      [
        "in",
        {
          type: "inbound-rtp",
          timestamp: 11,
          bytesReceived: 500,
          packetsLost: 2,
          packetsReceived: 98,
          jitter: 0.02,
        },
      ],
      ["out", { type: "outbound-rtp", timestamp: 12, bytesSent: 300 }],
    ]);

    expect(normalizeRtcStats(entries as unknown as RTCStatsReport)).toEqual(
      expect.objectContaining({
        availableIncomingBitrate: 2_000_000,
        availableOutgoingBitrate: 1_000_000,
        bytesReceived: 500,
        bytesSent: 300,
        jitter: 0.02,
        packetsLost: 2,
        packetsReceived: 98,
        roundTripTime: 0.1,
      }),
    );
  });
});
