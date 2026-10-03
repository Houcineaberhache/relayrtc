import type { IsoDateTime, ParticipantId, RoomId } from "./common.js";

export const connectionQualities = ["excellent", "good", "poor", "critical", "lost"] as const;

export type ConnectionQuality = (typeof connectionQualities)[number];

export const roomQualityModes = ["auto", "high", "balanced", "data-saver"] as const;

export type RoomQualityMode = (typeof roomQualityModes)[number];

export const videoQualityPreferences = ["auto", "1080p", "720p", "360p", "audio-only"] as const;

export type VideoQualityPreference = (typeof videoQualityPreferences)[number];

export interface QualityModeSettings {
  readonly receive: VideoQualityPreference;
  readonly send: VideoQualityPreference;
}

export const roomQualityModeSettings: Readonly<Record<RoomQualityMode, QualityModeSettings>> = {
  auto: { receive: "auto", send: "auto" },
  high: { receive: "1080p", send: "1080p" },
  balanced: { receive: "720p", send: "720p" },
  "data-saver": { receive: "360p", send: "360p" },
};

export interface ConnectionQualityEvent {
  readonly occurredAt: IsoDateTime;
  readonly participantId: ParticipantId;
  readonly previousQuality: ConnectionQuality;
  readonly quality: ConnectionQuality;
  readonly roomId: RoomId;
}
