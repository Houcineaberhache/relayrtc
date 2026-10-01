import type {
  EnvironmentId,
  IsoDateTime,
  OrganizationId,
  ProjectId,
  RoomId,
  UsageEventId,
  UsageRecordId,
} from "./common.js";

export const usageGranularities = ["minute", "hour", "day", "month"] as const;

export type UsageGranularity = (typeof usageGranularities)[number];

export const usageEventTypes = [
  "participant.connected",
  "participant.disconnected",
  "sfu.bytes.ingress",
  "sfu.bytes.egress",
  "turn.bytes.ingress",
  "turn.bytes.egress",
  "room.started",
  "room.ended",
] as const;

export type UsageEventType = (typeof usageEventTypes)[number];

export interface UsageDimensions {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly roomId: RoomId | null;
  readonly region: string | null;
}

export interface UsageMetrics {
  readonly participantSeconds: number;
  readonly participantMinutesDerived: number;
  readonly audioParticipantSeconds: number;
  readonly videoParticipantSeconds: number;
  readonly sfuIngressBytes: number;
  readonly sfuEgressBytes: number;
  readonly turnIngressBytes: number;
  readonly turnEgressBytes: number;
  readonly turnRelaySeconds: number;
  readonly turnSessions: number;
  readonly signalingConnections: number;
  readonly signalingConnectionSeconds: number;
  readonly signalingMessagesIn: number;
  readonly signalingMessagesOut: number;
  readonly roomsCreated: number;
  readonly roomsStarted: number;
  readonly roomSeconds: number;
  readonly peakConcurrentRooms: number;
  readonly peakConcurrentParticipants: number;
  readonly averageConcurrentParticipants: number;
  readonly screenShareSeconds: number;
  readonly screenShareIngressBytes: number;
  readonly screenShareEgressBytes: number;
}

export interface UsageEvent {
  readonly id: UsageEventId;
  readonly type: UsageEventType;
  readonly dimensions: UsageDimensions;
  readonly value: number;
  readonly occurredAt: IsoDateTime;
}

export interface UsageRecord {
  readonly id: UsageRecordId;
  readonly dimensions: UsageDimensions;
  readonly granularity: UsageGranularity;
  readonly windowStartedAt: IsoDateTime;
  readonly windowEndedAt: IsoDateTime;
  readonly metrics: UsageMetrics;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}
