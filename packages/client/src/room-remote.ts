import type { Participant, Track } from "@relayrtc/types";

export type RemoteTrackSubscriptionState =
  "unsubscribed" | "subscribing" | "subscribed" | "failed" | "closed";

export interface RoomRemoteTrack {
  readonly id: string;
  readonly info: Track;
  readonly participantId: string;
  readonly type: Track["type"];
  readonly subscriptionState: RemoteTrackSubscriptionState;
  readonly mediaStreamTrack: MediaStreamTrack | null;
  readonly stream: MediaStream | null;
  subscribe(): Promise<MediaStreamTrack>;
  unsubscribe(): Promise<void>;
  attach(element: HTMLMediaElement): Promise<HTMLMediaElement>;
  detach(element?: HTMLMediaElement): void;
}

export interface RoomRemoteParticipant extends Participant {
  readonly tracks: ReadonlyMap<string, RoomRemoteTrack>;
}
