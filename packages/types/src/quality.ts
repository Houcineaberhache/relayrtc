import type { IsoDateTime, ParticipantId, RoomId } from "./common.js";

export const connectionQualities = ["excellent", "good", "poor", "critical", "lost"] as const;

export type ConnectionQuality = (typeof connectionQualities)[number];

export interface ConnectionQualityEvent {
  readonly occurredAt: IsoDateTime;
  readonly participantId: ParticipantId;
  readonly previousQuality: ConnectionQuality;
  readonly quality: ConnectionQuality;
  readonly roomId: RoomId;
}
