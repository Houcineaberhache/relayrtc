import type { ParticipantJoinAcceptedPayload, ServerProtocolMessage } from "@relayrtc/protocol";
import type { Participant } from "@relayrtc/types";
import { RoomError } from "./room-errors.js";
import { RoomEventEmitter } from "./room-events.js";
import { RoomRtc } from "./room-rtc.js";
import { LocalRoomMedia } from "./room-local-media.js";
import { RemoteRoomRegistry } from "./room-participants.js";
import type { RoomLocalParticipant } from "./room-media.js";
import type { JoinOptions, RelayClientOptions, Room, RoomConnectionState } from "./room.js";
import { SignalingClient } from "./signaling-client.js";
import { RoomMessaging } from "./room-messaging.js";
import { LocalParticipantView } from "./room-local-participant.js";
import type { RoomPresenceSnapshot } from "./room-messaging-types.js";

export class RoomSession extends RoomEventEmitter implements Room {
  #state: RoomConnectionState = "connecting";
  #joined: ParticipantJoinAcceptedPayload | undefined;
  #ended = false;
  #exiting = false;
  #presence: RoomPresenceSnapshot = Object.freeze({
    localParticipant: null,
    participants: Object.freeze([]),
  });
  #presenceKey = JSON.stringify(this.#presence);
  #leaving: Promise<void> | undefined;
  #stopSetup: ((error: RoomError) => void) | undefined;
  readonly #rtc = new RoomRtc();
  readonly #signaling: SignalingClient;
  readonly #localMedia: LocalRoomMedia;
  readonly #remote: RemoteRoomRegistry;
  readonly #messaging: RoomMessaging;
  readonly #localParticipant: RoomLocalParticipant;

  constructor(
    readonly options: RelayClientOptions,
    readonly clientEvents: RoomEventEmitter,
    readonly onEnded: () => void,
  ) {
    super();
    this.#remote = new RemoteRoomRegistry(
      this.#rtc,
      {
        emit: (event, value) => {
          if (
            event === "participantJoined" ||
            event === "participantLeft" ||
            event === "participantUpdated"
          )
            this.#refreshPresence();
          this.emit(event, value);
          this.clientEvents.emit(event, value);
        },
      },
      () => {
        if (this.#ended || this.#exiting || this.#state !== "connected")
          throw new RoomError("NOT_CONNECTED", "Join the room before subscribing to remote media");
      },
      options.autoSubscribe ?? true,
    );
    this.#localMedia = new LocalRoomMedia(
      this.#rtc,
      () => {
        if (this.#ended || this.#exiting || this.#state !== "connected")
          throw new RoomError("NOT_CONNECTED", "Join the room before using local media controls");
      },
      (error) => {
        if (!this.#ended && !this.#leaving) {
          this.emit("error", error);
          this.clientEvents.emit("error", error);
        }
      },
    );
    this.#signaling = new SignalingClient(
      options.signalingUrl,
      options.requestTimeoutMs ?? 10_000,
      this.#onMessage,
      (error) => {
        this.#fail(error);
      },
    );
    this.#messaging = new RoomMessaging(
      this.#signaling,
      () => {
        if (this.#ended || this.#exiting || this.#state !== "connected")
          throw new RoomError(
            "NOT_CONNECTED",
            "Join the room before sending messages or updating metadata",
          );
        return this.#requireJoined();
      },
      {
        on: (event, listener) => this.on(event, listener),
        emit: (event, value) => {
          this.emit(event, value);
          this.clientEvents.emit(event, value);
        },
      },
      (participant) => {
        this.#updateLocalParticipant(participant);
      },
    );
    this.#localParticipant = new LocalParticipantView(
      () => this.#requireJoined().localParticipant,
      this.#localMedia,
      (metadata) => this.#messaging.updateMetadata(metadata),
    );
  }

  get connectionState(): RoomConnectionState {
    return this.#state;
  }
  get participants(): Room["participants"] {
    return this.#remote.participants;
  }
  get remoteTracks(): Room["remoteTracks"] {
    return this.#remote.tracks;
  }
  get messages(): Room["messages"] {
    return this.#messaging.messages;
  }
  get events(): Room["events"] {
    return this.#messaging.customEvents;
  }
  get presence(): RoomPresenceSnapshot {
    return this.#presence;
  }
  get id(): string {
    return this.info.id;
  }
  get info(): ParticipantJoinAcceptedPayload["room"] {
    return this.#requireJoined().room;
  }
  get localParticipant(): RoomLocalParticipant {
    this.#requireJoined();
    return this.#localParticipant;
  }
  get microphone(): Room["microphone"] {
    return this.#localMedia.microphone;
  }
  get camera(): Room["camera"] {
    return this.#localMedia.camera;
  }
  get screen(): Room["screen"] {
    return this.#localMedia.screen;
  }
  get devices(): Room["devices"] {
    return this.#localMedia.devices;
  }
  get permissions(): Room["permissions"] {
    return this.#localMedia.permissions;
  }
  get session(): ParticipantJoinAcceptedPayload["session"] {
    return this.#requireJoined().session;
  }

  async start(
    token: string,
    scope: { roomId: string; participantId: string },
    joinOptions: JoinOptions,
  ): Promise<void> {
    const abort = (): void => {
      void this.leave().catch(() => undefined);
    };
    joinOptions.signal?.addEventListener("abort", abort, { once: true });
    try {
      this.#setState("connecting");
      if (joinOptions.signal?.aborted) abort();
      this.#assertOpen();
      await this.#signaling.connect(token);
      this.#assertOpen();
      const joined = await this.#signaling.request(
        "participant.join",
        {
          roomId: scope.roomId,
          participantToken: token,
        },
        "participant.join.accepted",
      );
      this.#assertOpen();
      if (
        joined.room.id !== scope.roomId ||
        joined.localParticipant.id !== scope.participantId ||
        joined.localParticipant.roomId !== scope.roomId ||
        joined.session.participantId !== scope.participantId ||
        joined.session.connectionState !== "connected"
      ) {
        throw new RoomError(
          "PROTOCOL_ERROR",
          "The join response does not match the participant token",
        );
      }
      this.#joined = joined;
      this.#remote.reconcile(joined, {
        roomId: joined.room.id,
        participantId: joined.localParticipant.id,
        sessionId: joined.session.id,
      });
      this.#refreshPresence();
      await this.#initializeRtc({
        roomId: joined.room.id,
        sessionId: joined.session.id,
      });
      this.#assertOpen();
      this.#setState("connected");
      this.#assertOpen();
      this.#remote.ready();
    } catch (error) {
      const failure =
        error instanceof RoomError
          ? error
          : new RoomError("RTC_SETUP_FAILED", "Browser media setup failed");
      if (this.#leaving) {
        await this.#leaving.catch(() => undefined);
      } else if (!this.#ended) {
        this.#rtc.close();
        await this.#leaveRemote().catch(() => undefined);
        this.#fail(failure);
      }
      throw failure;
    } finally {
      joinOptions.signal?.removeEventListener("abort", abort);
    }
  }

  leave(): Promise<void> {
    if (this.#leaving) return this.#leaving;
    if (this.#ended || this.#exiting) return Promise.resolve();
    this.#exiting = true;
    this.#messaging.dispose();
    this.#localMedia.dispose();
    this.#remote.dispose();
    this.#refreshPresence();
    if (this.#state === "connecting") {
      const error = new RoomError("JOIN_CANCELLED", "Joining the room was cancelled");
      this.#rtc.close();
      this.#stopSetup?.(error);
      if (!this.#joined) {
        this.#finish("disconnected", error);
        return Promise.resolve();
      }
    }
    this.#rtc.close();
    this.#leaving = this.#leaveRemote()
      .catch((error: unknown) => {
        const failure =
          error instanceof RoomError
            ? error
            : new RoomError("CONNECTION_FAILED", "Leaving the room failed");
        this.emit("error", failure);
        this.clientEvents.emit("error", failure);
        throw failure;
      })
      .finally(() => {
        this.#finish("disconnected");
      });
    return this.#leaving;
  }

  async #initializeRtc(scope: {
    roomId: ParticipantJoinAcceptedPayload["room"]["id"];
    sessionId: ParticipantJoinAcceptedPayload["session"]["id"];
  }): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        this.#stopSetup = reject;
        timer = setTimeout(() => {
          reject(new RoomError("REQUEST_TIMEOUT", "Browser media setup timed out", true));
        }, this.options.requestTimeoutMs ?? 10_000);
        void this.#rtc
          .initialize(this.#signaling, scope, this.options, (error) => {
            this.#fail(error);
          })
          .then(resolve, reject);
      });
    } finally {
      clearTimeout(timer);
      this.#stopSetup = undefined;
    }
  }

  async #leaveRemote(): Promise<void> {
    const joined = this.#joined;
    if (!joined) return;
    const left = await this.#signaling.request(
      "participant.leave",
      {
        roomId: joined.room.id,
        participantId: joined.localParticipant.id,
        sessionId: joined.session.id,
      },
      "participant.leave.accepted",
    );
    if (
      left.roomId !== joined.room.id ||
      left.participantId !== joined.localParticipant.id ||
      left.sessionId !== joined.session.id
    ) {
      throw new RoomError("PROTOCOL_ERROR", "The leave response does not match the joined session");
    }
  }

  #fail(error: RoomError): void {
    if (this.#ended || this.#exiting) return;
    this.#finish("failed", error, true);
  }

  #finish(state: RoomConnectionState, error?: RoomError, reportError = false): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#messaging.dispose();
    this.#localMedia.dispose();
    this.#remote.dispose();
    this.#refreshPresence();
    this.#stopSetup?.(error ?? new RoomError("JOIN_CANCELLED", "Room setup was cancelled"));
    this.#rtc.close();
    this.#signaling.close(error);
    this.#state = state;
    if (reportError && error) {
      this.emit("error", error);
      this.clientEvents.emit("error", error);
    }
    this.#setState(state);
    this.onEnded();
    this.clear();
  }

  #setState(state: RoomConnectionState): void {
    this.#state = state;
    this.emit("connectionStateChanged", state);
    this.clientEvents.emit("connectionStateChanged", state);
  }

  #assertOpen(): void {
    if (this.#ended || this.#exiting)
      throw new RoomError("JOIN_CANCELLED", "Joining the room was cancelled");
  }

  #requireJoined(): ParticipantJoinAcceptedPayload {
    if (!this.#joined) throw new RoomError("NOT_CONNECTED", "The room has not been joined");
    return this.#joined;
  }

  #updateLocalParticipant(participant: Participant): void {
    const joined = this.#joined;
    if (!joined || this.#ended || this.#exiting) return;
    if (participant.id !== joined.localParticipant.id || participant.roomId !== joined.room.id)
      throw new RoomError(
        "PROTOCOL_ERROR",
        "The local participant update belongs to another session",
      );
    if (JSON.stringify(joined.localParticipant) === JSON.stringify(participant)) return;
    this.#joined = { ...joined, localParticipant: participant };
    this.#refreshPresence();
    this.emit("localParticipantUpdated", this.#localParticipant);
    this.clientEvents.emit("localParticipantUpdated", this.#localParticipant);
  }

  #refreshPresence(): void {
    const active = !this.#ended && !this.#exiting;
    const snapshot: RoomPresenceSnapshot = {
      localParticipant: active ? (this.#joined?.localParticipant ?? null) : null,
      participants: active ? this.#remote.snapshotParticipants() : [],
    };
    const key = JSON.stringify(snapshot);
    if (key === this.#presenceKey) return;
    const copy = structuredClone(snapshot);
    this.#presence = Object.freeze({
      localParticipant: copy.localParticipant,
      participants: Object.freeze(copy.participants),
    });
    this.#presenceKey = key;
    this.emit("presenceChanged", this.#presence);
    this.clientEvents.emit("presenceChanged", this.#presence);
  }

  readonly #onMessage = (message: ServerProtocolMessage): void => {
    if (this.#ended || this.#exiting) return;
    try {
      if (message.type === "room.ended" && message.payload.room.id === this.#joined?.room.id) {
        this.#fail(new RoomError("ROOM_ENDED", "The room has ended"));
      } else if (
        message.type === "participant.left" &&
        message.payload.participantId === this.#joined?.localParticipant.id &&
        message.payload.sessionId === this.#joined.session.id
      ) {
        this.#fail(new RoomError("CONNECTION_CLOSED", "The local participant left the room"));
      }
      if (message.type === "session.resume.accepted" && this.#joined) {
        const payload = message.payload;
        if (
          payload.roomId !== this.#joined.room.id ||
          payload.session.participantId !== this.#joined.localParticipant.id ||
          payload.session.id !== this.#joined.session.id
        )
          throw new RoomError(
            "PROTOCOL_ERROR",
            "The resumed snapshot does not match the room session",
          );
        this.#joined = {
          ...this.#joined,
          session: payload.session,
          participants: payload.participants,
          tracks: payload.tracks,
        };
        this.#remote.reconcile(payload, {
          roomId: payload.roomId,
          participantId: payload.session.participantId,
          sessionId: payload.session.id,
        });
        const local = payload.participants.find(
          (participant) => participant.id === payload.session.participantId,
        );
        if (local?.roomId !== payload.roomId || local.leftAt !== null)
          throw new RoomError(
            "PROTOCOL_ERROR",
            "The resumed presence snapshot is missing the local participant",
          );
        this.#updateLocalParticipant(local);
        this.#refreshPresence();
      }
      if (
        message.type === "participant.metadata.updated" &&
        message.payload.participant.id === this.#joined?.localParticipant.id &&
        message.payload.participant.roomId === this.#joined.room.id
      )
        this.#updateLocalParticipant(message.payload.participant);
      this.#remote.handle(message);
      if (this.#joined) this.#messaging.handle(message, this.#joined.room.id);
    } catch (error) {
      this.#fail(
        error instanceof RoomError
          ? error
          : new RoomError("PROTOCOL_ERROR", "The room event could not be applied"),
      );
    }
  };
}
