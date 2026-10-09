import { Device, type types } from "mediasoup-client";
import type { RtcSessionScope } from "@relayrtc/protocol";
import { RoomError } from "./room-errors.js";
import type { RelayClientOptions } from "./room.js";
import type { SignalingClient } from "./signaling-client.js";

export class RoomRtc {
  readonly #transports: types.Transport[] = [];
  #closed = false;

  async initialize(
    signaling: SignalingClient,
    scope: RtcSessionScope,
    options: RelayClientOptions,
    onFailure: (error: RoomError) => void,
  ): Promise<void> {
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

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
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
