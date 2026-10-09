import type { ParticipantSession, Room as RoomInfo } from "@relayrtc/types";
import type { RoomError } from "./room-errors.js";
import type { RoomLocalMedia, RoomLocalParticipant } from "./room-media.js";
import type { RoomRemoteParticipant, RoomRemoteTrack } from "./room-remote.js";
import type {
  RoomCustomEvent,
  RoomCustomEvents,
  RoomMessages,
  RoomPresenceSnapshot,
  RoomTextMessage,
} from "./room-messaging-types.js";

export type RoomConnectionState = "connecting" | "connected" | "disconnected" | "failed";

export interface RoomEvents {
  readonly connectionStateChanged: RoomConnectionState;
  readonly error: RoomError;
  readonly messageReceived: RoomTextMessage;
  readonly messageSent: RoomTextMessage;
  readonly customEventReceived: RoomCustomEvent;
  readonly customEventSent: RoomCustomEvent;
  readonly localParticipantUpdated: RoomLocalParticipant;
  readonly presenceChanged: RoomPresenceSnapshot;
  readonly participantJoined: RoomRemoteParticipant;
  readonly participantLeft: RoomRemoteParticipant;
  readonly participantUpdated: RoomRemoteParticipant;
  readonly participantReconnected: {
    readonly participant: RoomRemoteParticipant;
    readonly session: ParticipantSession;
  };
  readonly trackPublished: RoomRemoteTrack;
  readonly trackUnpublished: RoomRemoteTrack;
  readonly trackUpdated: RoomRemoteTrack;
  readonly trackSubscribed: RoomRemoteTrack;
  readonly trackUnsubscribed: RoomRemoteTrack;
  readonly trackSubscriptionFailed: { readonly track: RoomRemoteTrack; readonly error: RoomError };
}

export interface Room extends RoomLocalMedia {
  readonly id: string;
  readonly info: RoomInfo;
  readonly localParticipant: RoomLocalParticipant;
  readonly session: ParticipantSession;
  readonly connectionState: RoomConnectionState;
  readonly participants: ReadonlyMap<string, RoomRemoteParticipant>;
  readonly remoteTracks: ReadonlyMap<string, RoomRemoteTrack>;
  readonly messages: RoomMessages;
  readonly events: RoomCustomEvents;
  readonly presence: RoomPresenceSnapshot;
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
  readonly autoSubscribe?: boolean;
}

export interface JoinOptions {
  readonly signal?: AbortSignal;
}
