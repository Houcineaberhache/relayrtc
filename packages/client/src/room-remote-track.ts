import type { Track } from "@relayrtc/types";
import { RoomError } from "./room-errors.js";
import type { RoomEventEmitter } from "./room-events.js";
import type { RoomRemoteTrack, RemoteTrackSubscriptionState } from "./room-remote.js";
import type { RemoteSubscription, RoomRtc } from "./room-rtc.js";

export class RemoteTrack implements RoomRemoteTrack {
  #info: Track;
  #state: RemoteTrackSubscriptionState = "unsubscribed";
  #subscription: RemoteSubscription | undefined;
  #stream: MediaStream | null = null;
  #pending: Promise<MediaStreamTrack> | undefined;
  #closing: Promise<void> | undefined;
  #version = 0;
  readonly #attachments = new Map<
    HTMLMediaElement,
    { stream?: MediaStream; track?: MediaStreamTrack }
  >();

  constructor(
    info: Track,
    readonly rtc: RoomRtc,
    readonly events: Pick<RoomEventEmitter, "emit">,
    readonly assertActive: () => void,
  ) {
    this.#info = info;
  }
  get id(): string {
    return this.#info.id;
  }
  get info(): Track {
    return this.#info;
  }
  get participantId(): string {
    return this.#info.participantId;
  }
  get type(): Track["type"] {
    return this.#info.type;
  }
  get subscriptionState(): RemoteTrackSubscriptionState {
    return this.#state;
  }
  get mediaStreamTrack(): MediaStreamTrack | null {
    return this.#subscription?.track ?? null;
  }
  get stream(): MediaStream | null {
    return this.#stream;
  }

  subscribe(): Promise<MediaStreamTrack> {
    try {
      this.assertActive();
      if (this.#state === "closed")
        throw new RoomError("MEDIA_SUBSCRIBE_FAILED", "The remote track is no longer published");
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new RoomError("MEDIA_SUBSCRIBE_FAILED", "The remote subscription is unavailable"),
      );
    }
    if (this.#closing) return this.#closing.then(() => this.subscribe());
    if (this.#pending) return this.#pending;
    if (this.#subscription) return Promise.resolve(this.#subscription.track);
    const version = this.#version;
    this.#state = "subscribing";
    const operation = this.#receive(version);
    this.#pending = operation;
    void operation
      .finally(() => {
        if (this.#pending === operation) this.#pending = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  async #receive(version: number): Promise<MediaStreamTrack> {
    try {
      const subscription = await this.rtc.consume(this.#info, (error) => {
        if (!this.#subscription) return;
        this.#subscription = undefined;
        this.#stream = null;
        this.detach();
        this.#state = "unsubscribed";
        this.events.emit("trackUnsubscribed", this);
        if (error.code !== "MEDIA_OPERATION_CANCELLED") this.#report(error);
      });
      if (version !== this.#version) {
        await subscription.close();
        throw new RoomError("MEDIA_OPERATION_CANCELLED", "Remote subscription was cancelled");
      }
      this.#subscription = subscription;
      this.#stream = new MediaStream([subscription.track]);
      subscription.setPaused(this.#info.state === "paused");
      this.#state = "subscribed";
      this.events.emit("trackSubscribed", this);
      return subscription.track;
    } catch (error) {
      const failure =
        error instanceof RoomError
          ? error
          : new RoomError("MEDIA_SUBSCRIBE_FAILED", "The remote track could not be received");
      if (version === this.#version) this.#report(failure);
      throw failure;
    }
  }

  #report(error: RoomError): void {
    if (this.#state === "closed") return;
    this.#state = "failed";
    this.events.emit("trackSubscriptionFailed", { track: this, error });
    this.events.emit("error", error);
  }

  unsubscribe(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#version++;
    this.detach();
    const subscription = this.#subscription;
    this.#subscription = undefined;
    this.#stream = null;
    if (this.#state !== "closed") this.#state = "unsubscribed";
    if (subscription) {
      subscription.dispose();
      this.events.emit("trackUnsubscribed", this);
    }
    const pending = this.#pending;
    const operation = (async () => {
      if (subscription) await subscription.close();
      await pending?.catch(() => undefined);
    })();
    this.#closing = operation;
    void operation
      .finally(() => {
        if (this.#closing === operation) this.#closing = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  async attach(element: HTMLMediaElement): Promise<HTMLMediaElement> {
    this.detach(element);
    const attachment: { stream?: MediaStream; track?: MediaStreamTrack } = {};
    this.#attachments.set(element, attachment);
    try {
      const track = await this.subscribe();
      if (this.#attachments.get(element) !== attachment) return element;
      const stream =
        element.srcObject instanceof MediaStream ? element.srcObject : new MediaStream();
      stream.addTrack(track);
      attachment.stream = stream;
      attachment.track = track;
      element.srcObject = stream;
      return element;
    } catch (error) {
      if (this.#attachments.get(element) === attachment) this.#attachments.delete(element);
      throw error;
    }
  }

  detach(element?: HTMLMediaElement): void {
    for (const [target, attachment] of this.#attachments) {
      if (element && target !== element) continue;
      if (attachment.stream && attachment.track) {
        attachment.stream.removeTrack(attachment.track);
        if (target.srcObject === attachment.stream && attachment.stream.getTracks().length === 0)
          target.srcObject = null;
      }
      this.#attachments.delete(target);
    }
  }

  update(info: Track): void {
    this.#info = info;
    this.#subscription?.setPaused(info.state === "paused");
  }

  dispose(): void {
    if (this.#state === "closed") return;
    this.#version++;
    this.detach();
    const subscription = this.#subscription;
    this.#subscription = undefined;
    this.#stream = null;
    this.#state = "closed";
    subscription?.dispose();
    if (subscription) this.events.emit("trackUnsubscribed", this);
  }
}
