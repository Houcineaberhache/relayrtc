import { videoQualityPreferences, type Track, type VideoQualityPreference } from "@relayrtc/types";
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
  #desired = false;
  #autoAllowed = true;
  #preference: VideoQualityPreference | undefined;

  async setQuality(quality: VideoQualityPreference): Promise<void> {
    this.assertActive();
    if (
      this.#state === "closed" ||
      (this.#info.type !== "camera_video" && this.#info.type !== "screen_video")
    )
      throw new RoomError(
        "MEDIA_SUBSCRIBE_FAILED",
        "Quality preferences require a published video track",
      );
    if (!videoQualityPreferences.includes(quality))
      throw new RoomError("INVALID_CONFIGURATION", "Provide a supported video quality preference");
    this.#preference = quality;
    const version = this.#version;
    await this.#pending;
    this.assertActive();
    if (version !== this.#version)
      throw new RoomError(
        "MEDIA_OPERATION_CANCELLED",
        "The subscription changed during quality selection",
      );
    if (this.#subscription) await this.rtc.setSubscriptionQuality(this.#subscription.id, quality);
  }

  get wantsSubscription(): boolean {
    return this.#desired;
  }
  get canAutoSubscribe(): boolean {
    return this.#autoAllowed;
  }
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
    this.#desired = true;
    this.#autoAllowed = false;
    if (this.#closing) {
      const version = this.#version;
      return this.#closing.then(() => {
        if (version !== this.#version || !this.#desired)
          throw new RoomError("MEDIA_OPERATION_CANCELLED", "Remote subscription was cancelled");
        return this.subscribe();
      });
    }
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
      const subscription = await this.rtc.consume(
        this.#info,
        (error) => {
          if (!this.#subscription) return;
          this.#subscription = undefined;
          this.#stream = null;
          this.detach();
          this.#state = "unsubscribed";
          this.events.emit("trackUnsubscribed", this);
          if (error.code !== "MEDIA_OPERATION_CANCELLED") this.#report(error);
        },
        this.#preference,
      );
      if (version !== this.#version) {
        await subscription.close();
        throw new RoomError("MEDIA_OPERATION_CANCELLED", "Remote subscription was cancelled");
      }
      this.#subscription = subscription;
      this.#stream = new MediaStream([subscription.track]);
      subscription.setPaused(this.#info.state === "paused");
      this.#state = "subscribed";
      for (const [element, attachment] of this.#attachments)
        this.#attach(element, attachment, subscription.track);
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
    this.#desired = false;
    this.#autoAllowed = false;
    this.#version++;
    this.detach();
    if (this.#closing) return this.#closing;
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
      this.#attach(element, attachment, track);
      return element;
    } catch (error) {
      if (this.#attachments.get(element) === attachment) this.#attachments.delete(element);
      throw error;
    }
  }

  #attach(
    element: HTMLMediaElement,
    attachment: { stream?: MediaStream; track?: MediaStreamTrack },
    track: MediaStreamTrack,
  ): void {
    const stream = element.srcObject instanceof MediaStream ? element.srcObject : new MediaStream();
    stream.addTrack(track);
    attachment.stream = stream;
    attachment.track = track;
    element.srcObject = stream;
  }

  suspend(): void {
    if (this.#state === "closed") return;
    this.#version++;
    for (const [element, attachment] of this.#attachments) {
      if (attachment.stream && attachment.track) {
        attachment.stream.removeTrack(attachment.track);
        if (element.srcObject === attachment.stream && attachment.stream.getTracks().length === 0)
          element.srcObject = null;
      }
      delete attachment.stream;
      delete attachment.track;
    }
    const subscription = this.#subscription;
    this.#subscription = undefined;
    this.#stream = null;
    this.#state = "unsubscribed";
    subscription?.dispose();
    if (subscription) this.events.emit("trackUnsubscribed", this);
    const pending = this.#pending;
    const operation = Promise.all([
      subscription?.close() ?? Promise.resolve(),
      pending?.catch(() => undefined) ?? Promise.resolve(),
    ]).then(() => undefined);
    this.#closing = operation;
    void operation
      .finally(() => {
        if (this.#closing === operation) this.#closing = undefined;
      })
      .catch(() => undefined);
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
    this.#desired = false;
    this.detach();
    const subscription = this.#subscription;
    this.#subscription = undefined;
    this.#stream = null;
    this.#state = "closed";
    subscription?.dispose();
    if (subscription) this.events.emit("trackUnsubscribed", this);
  }
}
