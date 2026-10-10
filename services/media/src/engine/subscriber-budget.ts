import type { Consumer, Producer } from "mediasoup/types";
import type {
  MediaPriority,
  SelectedVideoQuality,
  SubscriberNetworkStats,
  SubscriberQualityMode,
} from "./quality-controller.js";

export interface VideoLayer {
  quality: Exclude<SelectedVideoQuality, "audio-only">;
  bitrate: number;
  spatialLayer: number;
  temporalLayer: number;
}
export interface BudgetTrack {
  id: string;
  priority: MediaPriority;
  screen: boolean;
  preference: SubscriberQualityMode;
  layers: readonly VideoLayer[];
  current: SelectedVideoQuality | null;
}
export const qualityRank: Record<SelectedVideoQuality, number> = {
  "audio-only": 0,
  "360p": 1,
  "720p": 2,
  "1080p": 3,
};

export function availableVideoLayers(producer: Producer, consumer: Consumer): VideoLayer[] {
  const encodings = producer.rtpParameters.encodings ?? [];
  const first = encodings[0];
  const mode = /^(?:L|S)(\d+)T(\d+)/u.exec(first?.scalabilityMode ?? "");
  const spatial =
    consumer.type === "simulcast"
      ? encodings.length
      : consumer.type === "svc"
        ? Number(mode?.[1] ?? 1)
        : 1;
  const temporal = Math.max(0, Number(mode?.[2] ?? 1) - 1);
  const sourceHeight =
    typeof producer.appData.sourceHeight === "number" ? producer.appData.sourceHeight : null;
  const profiles: VideoLayer[] = [];
  for (let index = 0; index < spatial; index++) {
    const encoding = consumer.type === "simulcast" ? encodings[index] : first;
    const scale =
      encoding?.rid === "q"
        ? 3
        : encoding?.rid === "h"
          ? 1.5
          : encoding?.rid === "f"
            ? 1
            : 2 ** (spatial - index - 1);
    const height = sourceHeight === null ? null : sourceHeight / scale;
    const quality =
      height !== null
        ? height > 720
          ? "1080p"
          : height > 360
            ? "720p"
            : "360p"
        : spatial >= 3
          ? index === 0
            ? "360p"
            : index === 1
              ? "720p"
              : "1080p"
          : spatial === 2
            ? index === 0
              ? "360p"
              : "720p"
            : "1080p";
    const base = { "360p": 500_000, "720p": 1_500_000, "1080p": 4_000_000 }[quality];
    const bitrate =
      encoding?.maxBitrate ??
      (consumer.type === "svc" && first?.maxBitrate
        ? first.maxBitrate / 2 ** (spatial - index - 1)
        : base);
    profiles.push({ quality, bitrate, spatialLayer: index, temporalLayer: temporal });
  }
  return profiles;
}

export function allocateSubscriberBudget(
  tracks: readonly BudgetTrack[],
  stats: SubscriberNetworkStats | undefined,
  audioTracks: number,
): Map<string, VideoLayer | null> {
  const allocation = new Map(tracks.map((track) => [track.id, null as VideoLayer | null]));
  if (stats?.stale) return allocation;
  const loss =
    stats?.packetLossRatio ??
    (stats && stats.packetsLost + stats.packetsReceived > 0
      ? stats.packetsLost / (stats.packetsLost + stats.packetsReceived)
      : 0);
  if (loss >= 0.2 || (stats?.roundTripTime ?? 0) >= 1) return allocation;
  // Unknown capacity preserves the current layers; it never grants a full budget to each track.
  const capacity = stats?.availableIncomingBitrate;
  if (capacity === null || capacity === undefined) {
    for (const track of tracks) {
      if (track.preference === "audio-only") continue;
      const current =
        track.current && track.current !== "audio-only"
          ? track.current
          : (track.layers[0]?.quality ?? "360p");
      const ceiling = Math.min(
        qualityRank[current],
        track.preference === "auto" ? qualityRank["1080p"] : qualityRank[track.preference],
      );
      allocation.set(
        track.id,
        [...track.layers].reverse().find((layer) => qualityRank[layer.quality] <= ceiling) ??
          (track.preference === "auto" ? (track.layers[0] ?? null) : null),
      );
    }
    return allocation;
  }
  let remaining = Math.max(
    0,
    capacity * (loss >= 0.08 ? 0.65 : 0.85) - Math.max(64_000, audioTracks * 64_000),
  );
  const weight = { high: 3, normal: 2, low: 1 };
  const ordered = [...tracks].sort(
    (left, right) =>
      weight[right.priority] - weight[left.priority] ||
      Number(right.screen) - Number(left.screen) ||
      left.id.localeCompare(right.id),
  );
  const eligible = (track: BudgetTrack): VideoLayer[] =>
    track.preference === "audio-only"
      ? []
      : track.layers.filter(
          (layer) =>
            track.preference === "auto" ||
            qualityRank[layer.quality] <= qualityRank[track.preference],
        );
  // Give each track a base layer before spending the remainder on upgrades.
  for (const track of ordered) {
    const base = eligible(track)[0];
    if (base && base.bitrate <= remaining) {
      allocation.set(track.id, base);
      remaining -= base.bitrate;
    }
  }
  for (const track of ordered) {
    for (const layer of eligible(track)) {
      const current = allocation.get(track.id);
      if (!current || layer.spatialLayer <= current.spatialLayer) continue;
      const extra = layer.bitrate - current.bitrate;
      // Upgrades need headroom; downgrades are immediate when the shared budget shrinks.
      const margin =
        qualityRank[layer.quality] > qualityRank[track.current ?? "audio-only"]
          ? layer.bitrate * 0.15
          : 0;
      if (extra + margin > remaining) break;
      allocation.set(track.id, layer);
      remaining -= extra;
    }
  }
  return allocation;
}
