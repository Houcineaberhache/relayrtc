import type { EnvironmentId, IsoDateTime, Metadata, ProjectId, RoomId } from "./common.js";

export const roomStatuses = ["created", "active", "ending", "ended", "failed"] as const;

export type RoomStatus = (typeof roomStatuses)[number];

export interface Room {
  readonly id: RoomId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly metadata: Metadata;
  readonly status: RoomStatus;
  readonly maxParticipants: number;
  readonly createdAt: IsoDateTime;
  readonly startedAt: IsoDateTime | null;
  readonly endedAt: IsoDateTime | null;
}
