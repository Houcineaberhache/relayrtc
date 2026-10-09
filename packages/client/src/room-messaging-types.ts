import type { CustomEventPayload, TextMessagePayload } from "@relayrtc/protocol";
import type { JsonValue, Participant } from "@relayrtc/types";

export type RoomTextMessage = TextMessagePayload;
export type RoomCustomEvent = CustomEventPayload;

export interface RoomMessages {
  send(text: string): Promise<RoomTextMessage>;
  subscribe(listener: (message: RoomTextMessage) => void): () => void;
}

export interface RoomCustomEvents {
  emit(name: string, data: JsonValue): Promise<RoomCustomEvent>;
  subscribe(listener: (event: RoomCustomEvent) => void): () => void;
}

export interface RoomPresenceSnapshot {
  readonly localParticipant: Participant | null;
  readonly participants: readonly Participant[];
}
