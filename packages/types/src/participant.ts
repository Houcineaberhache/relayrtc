import type { IsoDateTime, Metadata, ParticipantId, RoomId, SessionId } from "./common.js";

export const connectionStates = [
  "connecting",
  "connected",
  "reconnecting",
  "disconnected",
  "failed",
] as const;

export type ConnectionState = (typeof connectionStates)[number];

export const transportTypes = ["udp", "tcp", "tls"] as const;

export type TransportType = (typeof transportTypes)[number];
export type ParticipantRole = string;

export interface Participant {
  readonly id: ParticipantId;
  readonly roomId: RoomId;
  readonly externalId: string | null;
  readonly name: string;
  readonly metadata: Metadata;
  readonly role: ParticipantRole;
  readonly joinedAt: IsoDateTime;
  readonly leftAt: IsoDateTime | null;
}

export interface ParticipantSession {
  readonly id: SessionId;
  readonly participantId: ParticipantId;
  readonly signalingNodeId: string;
  readonly mediaNodeId: string | null;
  readonly connectionState: ConnectionState;
  readonly transportType: TransportType;
  readonly joinedAt: IsoDateTime;
  readonly disconnectedAt: IsoDateTime | null;
  readonly reconnectedAt: IsoDateTime | null;
}
