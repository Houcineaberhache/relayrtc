export const mediaPriorities = ["high", "normal", "low"] as const;
export type MediaPriority = (typeof mediaPriorities)[number];

export const subscriberQualityModes = ["auto", "1080p", "720p", "360p", "audio-only"] as const;
export type SubscriberQualityMode = (typeof subscriberQualityModes)[number];
export type SelectedVideoQuality = Exclude<SubscriberQualityMode, "auto">;

export interface SubscriberNetworkStats {
  availableIncomingBitrate: number | null;
  jitter: number | null;
  packetsLost: number;
  packetsReceived: number;
  roundTripTime: number | null;
  timestamp: number;
}

export interface PreferredLayers {
  spatialLayer: number;
  temporalLayer: number;
}

const minimumBitrate: Record<Exclude<SelectedVideoQuality, "audio-only">, number> = {
  "1080p": 2_500_000,
  "720p": 1_000_000,
  "360p": 250_000,
};

const priorityFactor: Record<MediaPriority, number> = { high: 0.75, normal: 1, low: 1.35 };

export const preferredLayers: Record<
  Exclude<SelectedVideoQuality, "audio-only">,
  PreferredLayers
> = {
  "1080p": { spatialLayer: 2, temporalLayer: 2 },
  "720p": { spatialLayer: 1, temporalLayer: 2 },
  "360p": { spatialLayer: 0, temporalLayer: 1 },
};

export const selectVideoQuality = (
  stats: SubscriberNetworkStats,
  priority: MediaPriority,
): SelectedVideoQuality => {
  const totalPackets = stats.packetsLost + stats.packetsReceived;
  const loss = totalPackets === 0 ? 0 : stats.packetsLost / totalPackets;
  const bitrate = stats.availableIncomingBitrate;
  if (loss >= 0.2 || (stats.roundTripTime ?? 0) >= 1 || (bitrate !== null && bitrate < 80_000))
    return "audio-only";
  const factor = priorityFactor[priority];
  if (bitrate === null) {
    if (loss < 0.08 && (stats.roundTripTime ?? 0) < 0.5) return "720p";
    return "360p";
  }
  if (
    loss < 0.03 &&
    (stats.roundTripTime ?? 0) < 0.25 &&
    bitrate >= minimumBitrate["1080p"] * factor
  ) {
    return "1080p";
  }
  if (
    loss < 0.08 &&
    (stats.roundTripTime ?? 0) < 0.5 &&
    bitrate >= minimumBitrate["720p"] * factor
  ) {
    return "720p";
  }
  if (bitrate >= minimumBitrate["360p"] * factor) return "360p";
  return "audio-only";
};
