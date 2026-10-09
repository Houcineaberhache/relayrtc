import type { ParticipantJoinAcceptedPayload, ServerProtocolMessage } from "@relayrtc/protocol";
import { RoomError } from "./room-errors.js";
import { RoomEventEmitter } from "./room-events.js";
import { RoomRtc } from "./room-rtc.js";
import { LocalRoomMedia } from "./room-local-media.js";
import type { RoomLocalParticipant } from "./room-media.js";
import type { JoinOptions, RelayClientOptions, Room, RoomConnectionState } from "./room.js";
import { SignalingClient } from "./signaling-client.js";

export class RoomSession extends RoomEventEmitter implements Room {
  #state: RoomConnectionState = "connecting";
  #joined: ParticipantJoinAcceptedPayload | undefined;
  #ended = false;
  #leaving: Promise<void> | undefined;
  #stopSetup: ((error: RoomError) => void) | undefined;
  readonly #rtc = new RoomRtc();
  readonly #signaling: SignalingClient;
  readonly #localMedia: LocalRoomMedia;

  constructor(
    readonly options: RelayClientOptions,
    readonly clientEvents: RoomEventEmitter,
    readonly onEnded: () => void,
  ) {
    super();
    this.#localMedia = new LocalRoomMedia(
      this.#rtc,
      () => {
        if (this.#ended || this.#leaving || this.#state !== "connected")
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
  }

  get connectionState(): RoomConnectionState {
    return this.#state;
  }
  get id(): string {
    return this.info.id;
  }
  get info(): ParticipantJoinAcceptedPayload["room"] {
    return this.#requireJoined().room;
  }
  get localParticipant(): RoomLocalParticipant {
    return {
      ...this.#requireJoined().localParticipant,
      microphone: this.microphone,
      camera: this.camera,
      screen: this.screen,
      devices: this.devices,
      permissions: this.permissions,
    };
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
      await this.#initializeRtc({
        roomId: joined.room.id,
        sessionId: joined.session.id,
      });
      this.#assertOpen();
      this.#setState("connected");
      this.#assertOpen();
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
    if (this.#ended) return Promise.resolve();
    this.#localMedia.dispose();
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
    if (this.#ended || this.#leaving) return;
    this.#finish("failed", error, true);
  }

  #finish(state: RoomConnectionState, error?: RoomError, reportError = false): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#localMedia.dispose();
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
    if (this.#ended || this.#leaving)
      throw new RoomError("JOIN_CANCELLED", "Joining the room was cancelled");
  }

  #requireJoined(): ParticipantJoinAcceptedPayload {
    if (!this.#joined) throw new RoomError("NOT_CONNECTED", "The room has not been joined");
    return this.#joined;
  }

  readonly #onMessage = (message: ServerProtocolMessage): void => {
    if (message.type === "room.ended" && message.payload.room.id === this.#joined?.room.id) {
      this.#fail(new RoomError("ROOM_ENDED", "The room has ended"));
    } else if (
      message.type === "participant.left" &&
      message.payload.participantId === this.#joined?.localParticipant.id &&
      message.payload.sessionId === this.#joined.session.id
    ) {
      this.#fail(new RoomError("CONNECTION_CLOSED", "The local participant left the room"));
    }
  };
}
