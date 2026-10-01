import type { IsoDateTime, Metadata, ParticipantId, RoomId, SessionId, TrackId } from "./common.js";

export const trackTypes = [
  "audio",
  "camera_video",
  "screen_video",
  "screen_audio",
  "data",
] as const;

export type TrackType = (typeof trackTypes)[number];

export const trackStates = ["published", "paused", "resumed", "unpublished"] as const;

export type TrackState = (typeof trackStates)[number];

export const trackPriorities = ["high", "normal", "low"] as const;

export type TrackPriority = (typeof trackPriorities)[number];

export interface Track {
  readonly id: TrackId;
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly sessionId: SessionId;
  readonly type: TrackType;
  readonly state: TrackState;
  readonly priority: TrackPriority;
  readonly metadata: Metadata;
  readonly publishedAt: IsoDateTime;
  readonly unpublishedAt: IsoDateTime | null;
}
