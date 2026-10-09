import type { ParticipantJoinAcceptedPayload, ServerProtocolMessage } from "@relayrtc/protocol";
import type { JsonValue, Metadata, Participant } from "@relayrtc/types";
import { RoomError } from "./room-errors.js";
import type { RoomEventEmitter } from "./room-events.js";
import { snapshotRoomJson } from "./room-json.js";
import type {
  RoomCustomEvent,
  RoomCustomEvents,
  RoomMessages,
  RoomTextMessage,
} from "./room-messaging-types.js";
import type { SignalingClient } from "./signaling-client.js";

export class RoomMessaging {
  #closed = false;
  #metadataQueue = Promise.resolve();
  readonly #received = new Set<string>();
  readonly messages: RoomMessages = {
    send: (text) => this.#send(text),
    subscribe: (listener) => this.events.on("messageReceived", listener),
  };
  readonly customEvents: RoomCustomEvents = {
    emit: (name, data) => this.#emit(name, data),
    subscribe: (listener) => this.events.on("customEventReceived", listener),
  };

  constructor(
    readonly signaling: SignalingClient,
    readonly getJoined: () => ParticipantJoinAcceptedPayload,
    readonly events: Pick<RoomEventEmitter, "emit" | "on">,
    readonly updateParticipant: (participant: Participant) => void,
  ) {}

  #active(): ParticipantJoinAcceptedPayload {
    if (this.#closed) throw new RoomError("NOT_CONNECTED", "The room messaging session has closed");
    return this.getJoined();
  }

  #check(scope: ParticipantJoinAcceptedPayload): void {
    const current = this.#active();
    if (scope.room.id !== current.room.id || scope.session.id !== current.session.id)
      throw new RoomError(
        "NOT_CONNECTED",
        "The room messaging session changed during the operation",
      );
  }

  async #send(text: string): Promise<RoomTextMessage> {
    const joined = this.#active();
    const response = await this.signaling.request(
      "message.send",
      {
        roomId: joined.room.id,
        sessionId: joined.session.id,
        text,
      },
      "message.sent",
    );
    this.#check(joined);
    if (
      response.roomId !== joined.room.id ||
      response.participantId !== joined.localParticipant.id ||
      response.text !== text
    )
      throw new RoomError(
        "PROTOCOL_ERROR",
        "The text message acknowledgment does not match the request",
      );
    this.#remember(`text:${response.messageId}`);
    this.events.emit("messageSent", response);
    return response;
  }

  async #emit(name: string, data: JsonValue): Promise<RoomCustomEvent> {
    const joined = this.#active();
    const snapshot = snapshotRoomJson(data);
    const response = await this.signaling.request(
      "event.emit",
      {
        roomId: joined.room.id,
        sessionId: joined.session.id,
        name,
        data: snapshot,
      },
      "event.emitted",
    );
    this.#check(joined);
    if (
      response.roomId !== joined.room.id ||
      response.participantId !== joined.localParticipant.id ||
      response.name !== name
    )
      throw new RoomError(
        "PROTOCOL_ERROR",
        "The custom event acknowledgment does not match the request",
      );
    this.#remember(`event:${response.messageId}`);
    this.events.emit("customEventSent", response);
    return response;
  }

  async updateMetadata(metadata: Metadata): Promise<Participant> {
    const joined = this.#active();
    const snapshot = snapshotRoomJson(metadata);
    const operation = this.#metadataQueue.then(async () => {
      this.#check(joined);
      const response = await this.signaling.request(
        "participant.metadata.update",
        {
          roomId: joined.room.id,
          sessionId: joined.session.id,
          participantId: joined.localParticipant.id,
          metadata: snapshot,
        },
        "participant.metadata.update.accepted",
      );
      this.#check(joined);
      if (
        response.participant.id !== joined.localParticipant.id ||
        response.participant.roomId !== joined.room.id ||
        response.participant.leftAt !== null
      )
        throw new RoomError(
          "PROTOCOL_ERROR",
          "The metadata acknowledgment does not match the local participant",
        );
      this.updateParticipant(response.participant);
      return response.participant;
    });
    this.#metadataQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  handle(message: ServerProtocolMessage, roomId: string): void {
    if (this.#closed) return;
    if (message.type === "message.received" && message.payload.roomId === roomId) {
      const key = `text:${message.payload.messageId}`;
      if (this.#received.has(key)) return;
      this.#remember(key);
      this.events.emit("messageReceived", message.payload);
    } else if (message.type === "event.received" && message.payload.roomId === roomId) {
      const key = `event:${message.payload.messageId}`;
      if (this.#received.has(key)) return;
      this.#remember(key);
      this.events.emit("customEventReceived", message.payload);
    }
  }

  #remember(key: string): void {
    this.#received.add(key);
    if (this.#received.size > 4096) {
      const oldest = this.#received.values().next().value;
      if (oldest) this.#received.delete(oldest);
    }
  }

  dispose(): void {
    this.#closed = true;
    this.#received.clear();
  }
}
