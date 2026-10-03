export const videoQualityLevels = ["1080p", "720p", "360p", "audio-only"] as const;

export type VideoQualityLevel = (typeof videoQualityLevels)[number];

export interface RtcQualityStats {
  readonly availableIncomingBitrate: number | null;
  readonly availableOutgoingBitrate: number | null;
  readonly bytesReceived: number;
  readonly bytesSent: number;
  readonly jitter: number | null;
  readonly packetsLost: number;
  readonly packetsReceived: number;
  readonly roundTripTime: number | null;
  readonly timestamp: number;
}

export const simulcastEncodings: readonly RTCRtpEncodingParameters[] = [
  { active: true, maxBitrate: 500_000, maxFramerate: 30, rid: "q", scaleResolutionDownBy: 3 },
  { active: true, maxBitrate: 1_500_000, maxFramerate: 30, rid: "h", scaleResolutionDownBy: 1.5 },
  { active: true, maxBitrate: 4_000_000, maxFramerate: 30, rid: "f", scaleResolutionDownBy: 1 },
];

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const normalizeRtcStats = (report: RTCStatsReport): RtcQualityStats => {
  let availableIncomingBitrate: number | null = null;
  let availableOutgoingBitrate: number | null = null;
  let bytesReceived = 0;
  let bytesSent = 0;
  let jitter: number | null = null;
  let packetsLost = 0;
  let packetsReceived = 0;
  let roundTripTime: number | null = null;
  let timestamp = 0;

  report.forEach((rawEntry) => {
    const entry = rawEntry as unknown as Record<string, unknown>;
    timestamp = Math.max(timestamp, numeric(entry.timestamp) ?? 0);
    if (entry.type === "candidate-pair" && entry.state === "succeeded") {
      availableIncomingBitrate = numeric(entry.availableIncomingBitrate);
      availableOutgoingBitrate = numeric(entry.availableOutgoingBitrate);
      roundTripTime = numeric(entry.currentRoundTripTime);
    }
    if (entry.type === "inbound-rtp" && !entry.isRemote) {
      bytesReceived += numeric(entry.bytesReceived) ?? 0;
      packetsLost += numeric(entry.packetsLost) ?? 0;
      packetsReceived += numeric(entry.packetsReceived) ?? 0;
      jitter = Math.max(jitter ?? 0, numeric(entry.jitter) ?? 0);
    }
    if (entry.type === "outbound-rtp" && !entry.isRemote) {
      bytesSent += numeric(entry.bytesSent) ?? 0;
    }
  });

  return {
    availableIncomingBitrate,
    availableOutgoingBitrate,
    bytesReceived,
    bytesSent,
    jitter,
    packetsLost,
    packetsReceived,
    roundTripTime,
    timestamp: timestamp || Date.now(),
  };
};
