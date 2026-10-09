import type { Participant, ParticipantSession, Room as RoomInfo } from "@relayrtc/types";
import type { RoomError } from "./room-errors.js";

export type RoomConnectionState = "connecting" | "connected" | "disconnected" | "failed";

export interface RoomEvents {
  readonly connectionStateChanged: RoomConnectionState;
  readonly error: RoomError;
}

export interface Room {
  readonly id: string;
  readonly info: RoomInfo;
  readonly localParticipant: Participant;
  readonly session: ParticipantSession;
  readonly connectionState: RoomConnectionState;
  on<Event extends keyof RoomEvents>(
    event: Event,
    listener: (value: RoomEvents[Event]) => void,
  ): () => void;
  leave(): Promise<void>;
}

export interface RelayClientOptions {
  readonly signalingUrl: string;
  readonly requestTimeoutMs?: number;
  readonly iceServers?: readonly RTCIceServer[];
  readonly iceTransportPolicy?: RTCIceTransportPolicy;
}

export interface JoinOptions {
  readonly signal?: AbortSignal;
}
