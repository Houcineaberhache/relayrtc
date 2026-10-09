import { Device, type types } from "mediasoup-client";
import type { RtcSessionScope } from "@relayrtc/protocol";
import type { Track } from "@relayrtc/types";
import type { RoomLocalTrackType } from "./room-media.js";
import { simulcastEncodings } from "./quality.js";
import { RoomError } from "./room-errors.js";
import type { RelayClientOptions } from "./room.js";
import type { SignalingClient } from "./signaling-client.js";

export interface LocalPublication {
  readonly info: Track;
  readonly muted: boolean;
  replaceTrack(track: MediaStreamTrack): Promise<void>;
  mute(): void;
  unmute(): void;
  close(): Promise<void>;
  dispose(): void;
}

interface PublicationData extends types.AppData {
  trackType: RoomLocalTrackType;
  publication?: Track;
}

export class RoomRtc {
  readonly #transports: types.Transport[] = [];
  #closed = false;
  #sendTransport: types.Transport | undefined;
  #scope: RtcSessionScope | undefined;
  #signaling: SignalingClient | undefined;
  #onFailure: ((error: RoomError) => void) | undefined;
  readonly #publications = new Set<LocalPublication>();

  async initialize(
    signaling: SignalingClient,
    scope: RtcSessionScope,
    options: RelayClientOptions,
    onFailure: (error: RoomError) => void,
  ): Promise<void> {
    this.#scope = scope;
    this.#signaling = signaling;
    this.#onFailure = onFailure;
    const capabilities = await signaling.request("rtc.capabilities.get", scope, "rtc.capabilities");
    this.#assertOpen();
    const device = new Device();
    await device.load({
      routerRtpCapabilities: capabilities.routerCapabilities,
    });
    this.#assertOpen();
    for (const direction of ["send", "receive"] as const) {
      const response = await signaling.request(
        "rtc.transport.create",
        { ...scope, direction },
        "rtc.transport.created",
      );
      this.#assertOpen();
      this.#checkScope(response, scope);
      if (response.direction !== direction)
        throw new RoomError(
          "PROTOCOL_ERROR",
          "The media transport direction does not match the request",
        );
      const transportOptions: types.TransportOptions = {
        id: response.transportId,
        iceParameters: response.iceParameters as unknown as types.IceParameters,
        iceCandidates: response.iceCandidates as unknown as types.IceCandidate[],
        dtlsParameters: response.dtlsParameters as unknown as types.DtlsParameters,
        ...(options.iceServers ? { iceServers: [...options.iceServers] } : {}),
        ...(options.iceTransportPolicy ? { iceTransportPolicy: options.iceTransportPolicy } : {}),
      };
      const transport =
        direction === "send"
          ? device.createSendTransport(transportOptions)
          : device.createRecvTransport(transportOptions);
      this.#transports.push(transport);
      if (direction === "send") {
        this.#sendTransport = transport;
        transport.on("produce", ({ rtpParameters, appData }, callback, errback) => {
          const data = appData as PublicationData;
          void signaling
            .request(
              "rtc.track.publish",
              {
                ...scope,
                transportId: transport.id,
                trackType: data.trackType,
                rtpParameters,
                metadata: {},
              },
              "rtc.track.publish.accepted",
            )
            .then(async (published) => {
              this.#checkScope(published, scope);
              const info = published.track;
              if (
                info.roomId !== scope.roomId ||
                info.sessionId !== scope.sessionId ||
                info.type !== data.trackType ||
                info.state !== "published"
              ) {
                throw new RoomError(
                  "PROTOCOL_ERROR",
                  "The publication does not match the local track",
                );
              }
              data.publication = info;
              if (this.#closed) {
                await this.#unpublish(info);
                throw new RoomError("MEDIA_OPERATION_CANCELLED", "Media publication was cancelled");
              }
              callback({ id: info.id });
            })
            .catch((error: unknown) => {
              const failure =
                error instanceof RoomError
                  ? error
                  : new RoomError("MEDIA_PUBLISH_FAILED", "The local track could not be published");
              errback(failure);
              if (
                failure.code === "PROTOCOL_ERROR" ||
                failure.code === "REQUEST_TIMEOUT" ||
                failure.code === "CONNECTION_FAILED"
              )
                onFailure(failure);
            });
        });
      }
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        void signaling
          .request(
            "rtc.transport.connect",
            {
              ...scope,
              transportId: transport.id,
              dtlsParameters,
            },
            "rtc.transport.connected",
          )
          .then((connected) => {
            this.#assertOpen();
            this.#checkScope(connected, scope);
            if (connected.transportId !== transport.id)
              throw new RoomError(
                "PROTOCOL_ERROR",
                "The connected media transport does not match the request",
              );
            callback();
          })
          .catch((error: unknown) => {
            const failure =
              error instanceof RoomError
                ? error
                : new RoomError("RTC_SETUP_FAILED", "The media transport could not connect");
            errback(failure);
            onFailure(failure);
          });
      });
      transport.on("connectionstatechange", (state) => {
        if (!this.#closed && (state === "failed" || state === "disconnected")) {
          onFailure(
            new RoomError("RTC_SETUP_FAILED", "The media transport lost connectivity", true),
          );
        }
      });
    }
  }

  async publish(track: MediaStreamTrack, trackType: RoomLocalTrackType): Promise<LocalPublication> {
    this.#assertOpen();
    const transport = this.#sendTransport;
    if (!transport) throw new RoomError("NOT_CONNECTED", "The room media transport is unavailable");
    const data: PublicationData = { trackType };
    let producer: types.Producer | undefined;
    try {
      producer = await transport.produce({
        track,
        stopTracks: false,
        disableTrackOnPause: true,
        zeroRtpOnPause: true,
        appData: data,
        ...(track.kind === "video"
          ? { encodings: simulcastEncodings.map((encoding) => ({ ...encoding })) }
          : {}),
      });
      this.#assertOpen();
      const info = data.publication;
      if (!info) throw new RoomError("PROTOCOL_ERROR", "The local publication is unavailable");
      const sender = producer;
      let disposed = false;
      let closing: Promise<void> | undefined;
      const assertActive = (): void => {
        if (disposed || this.#closed || sender.closed)
          throw new RoomError("MEDIA_NOT_ENABLED", "The local publication is no longer active");
      };
      const publication: LocalPublication = {
        info,
        get muted() {
          return sender.paused;
        },
        replaceTrack: async (replacement) => {
          assertActive();
          await sender.replaceTrack({ track: replacement });
          assertActive();
        },
        mute: () => {
          assertActive();
          sender.pause();
        },
        unmute: () => {
          assertActive();
          sender.resume();
        },
        dispose: () => {
          if (disposed) return;
          disposed = true;
          sender.close();
          this.#publications.delete(publication);
        },
        close: () => {
          if (closing) return closing;
          publication.dispose();
          closing = this.#closed ? Promise.resolve() : this.#unpublish(info);
          return closing;
        },
      };
      this.#publications.add(publication);
      return publication;
    } catch (error) {
      producer?.close();
      if (data.publication && !this.#closed)
        await this.#unpublish(data.publication).catch(() => undefined);
      throw error instanceof RoomError
        ? error
        : new RoomError("MEDIA_PUBLISH_FAILED", "The local track could not be published");
    }
  }

  async #unpublish(info: Track): Promise<void> {
    const scope = this.#scope;
    const signaling = this.#signaling;
    if (!scope || !signaling || this.#closed) return;
    try {
      const response = await signaling.request(
        "rtc.track.control",
        { ...scope, trackId: info.id, action: "unpublish" },
        "rtc.track.control.accepted",
      );
      this.#checkScope(response, scope);
      if (response.track.id !== info.id || response.track.state !== "unpublished")
        throw new RoomError(
          "PROTOCOL_ERROR",
          "The removed publication does not match the local track",
        );
    } catch (error) {
      const failure =
        error instanceof RoomError
          ? error
          : new RoomError("MEDIA_PUBLISH_FAILED", "The local publication could not be removed");
      this.#reportCleanupFailure(failure);
      throw failure;
    }
  }

  #reportCleanupFailure(error: RoomError): void {
    if (!this.#closed) this.#onFailure?.(error);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const publication of this.#publications) publication.dispose();
    this.#publications.clear();
    for (const transport of this.#transports) transport.close();
    this.#transports.length = 0;
  }

  #assertOpen(): void {
    if (this.#closed) throw new RoomError("JOIN_CANCELLED", "Room setup was cancelled");
  }

  #checkScope(response: RtcSessionScope, scope: RtcSessionScope): void {
    if (response.roomId !== scope.roomId || response.sessionId !== scope.sessionId) {
      throw new RoomError("PROTOCOL_ERROR", "The media response does not match the joined session");
    }
  }
}
