import type { PeerConnectionFactory } from "./rtc-environment.js";
import { browserPeerConnectionFactory } from "./rtc-environment.js";
import { normalizeRtcError, RtcConnectionError } from "./rtc-errors.js";
import type {
  RemoteMediaTrackListener,
  RtcConnectionListener,
  RtcConnectionOptions,
  RtcConnectionSnapshot,
  RtcDescription,
  RtcIceCandidate,
  RtcIceCandidateListener,
  RtcStatsCollectorOptions,
} from "./rtc-types.js";
import { normalizeRtcStats } from "./quality.js";

const defaultIceGatheringTimeoutMs = 10_000;

const connectivityState = (
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
): RtcConnectionSnapshot["state"] => {
  if (connectionState === "closed") return "closed";
  if (connectionState === "failed" || iceConnectionState === "failed") return "failed";
  if (connectionState === "disconnected" || iceConnectionState === "disconnected") {
    return "disconnected";
  }
  if (
    connectionState === "connected" ||
    iceConnectionState === "connected" ||
    iceConnectionState === "completed"
  ) {
    return "connected";
  }
  if (connectionState === "connecting" || iceConnectionState === "checking") {
    return "connecting";
  }
  return "new";
};

const description = (
  value: RTCSessionDescription | null,
  expectedType: "offer" | "answer",
): RtcDescription => {
  if (value?.type !== expectedType || !value.sdp) {
    throw new RtcConnectionError(
      "RTC_INVALID_DESCRIPTION",
      `The local RTC ${expectedType} is unavailable`,
    );
  }
  return { type: expectedType, sdp: value.sdp };
};

export class RtcConnection {
  #previousStats: import("./quality.js").RtcQualityStats | undefined;
  readonly #connection: RTCPeerConnection;
  readonly #connectionListeners = new Set<RtcConnectionListener>();
  readonly #iceCandidateListeners = new Set<RtcIceCandidateListener>();
  readonly #iceGatheringTimeoutMs: number;
  readonly #pendingRemoteCandidates: (RtcIceCandidate | null)[] = [];
  readonly #remoteTrackListeners = new Set<RemoteMediaTrackListener>();

  constructor(
    options: RtcConnectionOptions = {},
    factory: PeerConnectionFactory = browserPeerConnectionFactory,
  ) {
    this.#connection = factory(options.configuration);
    this.#iceGatheringTimeoutMs = options.iceGatheringTimeoutMs ?? defaultIceGatheringTimeoutMs;
    this.#connection.addEventListener("connectionstatechange", this.#emitState);
    this.#connection.addEventListener("iceconnectionstatechange", this.#emitState);
    this.#connection.addEventListener("icegatheringstatechange", this.#emitState);
    this.#connection.addEventListener("icecandidate", this.#emitIceCandidate);
    this.#connection.addEventListener("signalingstatechange", this.#emitState);
    this.#connection.addEventListener("track", this.#emitRemoteTrack);
  }

  get current(): RtcConnectionSnapshot {
    return {
      state: connectivityState(
        this.#connection.connectionState,
        this.#connection.iceConnectionState,
      ),
      connectionState: this.#connection.connectionState,
      iceConnectionState: this.#connection.iceConnectionState,
      iceGatheringState: this.#connection.iceGatheringState,
      signalingState: this.#connection.signalingState,
    };
  }

  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    this.#assertOpen();
    return this.#connection.addTrack(track, ...streams);
  }

  addSimulcastTrack(
    track: MediaStreamTrack,
    encodings: readonly RTCRtpEncodingParameters[],
    ...streams: MediaStream[]
  ): RTCRtpSender {
    this.#assertOpen();
    return this.#connection.addTransceiver(track, {
      direction: "sendonly",
      sendEncodings: [...encodings],
      streams,
    }).sender;
  }

  async getStats(): Promise<import("./quality.js").RtcQualityStats> {
    this.#assertOpen();
    const stats = normalizeRtcStats(await this.#connection.getStats(), this.#previousStats);
    this.#previousStats = stats;
    return stats;
  }

  collectStats(options: RtcStatsCollectorOptions): () => void {
    const interval = setInterval(() => {
      void this.getStats()
        .then(options.onStats)
        .catch(() => undefined);
    }, options.intervalMs ?? 5_000);
    return () => {
      clearInterval(interval);
    };
  }

  removeTrack(sender: RTCRtpSender): void {
    this.#assertOpen();
    this.#connection.removeTrack(sender);
  }

  async replaceTrack(sender: RTCRtpSender, track: MediaStreamTrack | null): Promise<void> {
    this.#assertOpen();
    try {
      await sender.replaceTrack(track);
    } catch (error) {
      throw normalizeRtcError(error);
    }
  }

  async createOffer(): Promise<RtcDescription> {
    this.#assertOpen();
    try {
      return await this.#createLocalOffer();
    } catch (error) {
      throw normalizeRtcError(error);
    }
  }

  async restartIce(): Promise<RtcDescription> {
    this.#assertOpen();
    try {
      this.#connection.restartIce();
      return await this.#createLocalOffer({ iceRestart: true });
    } catch (error) {
      throw new RtcConnectionError("RTC_ICE_RESTART_FAILED", "RTC ICE restart failed", error);
    }
  }

  async addIceCandidate(candidate: RtcIceCandidate | null): Promise<void> {
    this.#assertOpen();
    if (!this.#connection.remoteDescription) {
      this.#pendingRemoteCandidates.push(candidate);
      return;
    }
    await this.#applyIceCandidate(candidate);
  }

  async acceptOffer(offer: RtcDescription): Promise<RtcDescription> {
    this.#assertDescription(offer, "offer");
    try {
      await this.#connection.setRemoteDescription(offer);
      await this.#flushPendingIceCandidates();
      const answer = await this.#connection.createAnswer();
      await this.#connection.setLocalDescription(answer);
      await this.#waitForIceGathering();
      return description(this.#connection.localDescription, "answer");
    } catch (error) {
      throw normalizeRtcError(error);
    }
  }

  async acceptAnswer(answer: RtcDescription): Promise<void> {
    this.#assertDescription(answer, "answer");
    try {
      await this.#connection.setRemoteDescription(answer);
      await this.#flushPendingIceCandidates();
    } catch (error) {
      throw normalizeRtcError(error);
    }
  }

  subscribe(listener: RtcConnectionListener): () => void {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  onIceCandidate(listener: RtcIceCandidateListener): () => void {
    this.#iceCandidateListeners.add(listener);
    return () => {
      this.#iceCandidateListeners.delete(listener);
    };
  }

  onRemoteTrack(listener: RemoteMediaTrackListener): () => void {
    this.#remoteTrackListeners.add(listener);
    return () => {
      this.#remoteTrackListeners.delete(listener);
    };
  }

  close(): void {
    if (this.#connection.signalingState === "closed") return;
    this.#connection.close();
    this.#connectionListeners.clear();
    this.#iceCandidateListeners.clear();
    this.#pendingRemoteCandidates.length = 0;
    this.#remoteTrackListeners.clear();
  }

  readonly #emitState = (): void => {
    const snapshot = this.current;
    for (const listener of this.#connectionListeners) listener(snapshot);
  };

  readonly #emitRemoteTrack = (event: RTCTrackEvent): void => {
    const remoteTrack = {
      track: event.track,
      streams: [...event.streams],
      transceiver: event.transceiver,
    };
    for (const listener of this.#remoteTrackListeners) listener(remoteTrack);
  };

  readonly #emitIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
    const candidate = event.candidate?.toJSON() ?? null;
    for (const listener of this.#iceCandidateListeners) listener(candidate);
  };

  #assertOpen(): void {
    if (this.#connection.signalingState === "closed") {
      throw new RtcConnectionError("RTC_CONNECTION_CLOSED", "The RTC connection is closed");
    }
  }

  #assertDescription(value: RtcDescription, expectedType: "offer" | "answer"): void {
    this.#assertOpen();
    if (value.type !== expectedType || !value.sdp.trim()) {
      throw new RtcConnectionError(
        "RTC_INVALID_DESCRIPTION",
        `A valid RTC ${expectedType} is required`,
      );
    }
  }

  async #createLocalOffer(options?: RTCOfferOptions): Promise<RtcDescription> {
    const offer = await this.#connection.createOffer(options);
    await this.#connection.setLocalDescription(offer);
    await this.#waitForIceGathering();
    return description(this.#connection.localDescription, "offer");
  }

  async #applyIceCandidate(candidate: RtcIceCandidate | null): Promise<void> {
    try {
      await this.#connection.addIceCandidate(candidate);
    } catch (error) {
      throw new RtcConnectionError(
        "RTC_ICE_CANDIDATE_FAILED",
        "The remote ICE candidate could not be applied",
        error,
      );
    }
  }

  async #flushPendingIceCandidates(): Promise<void> {
    const candidates = this.#pendingRemoteCandidates.splice(0);
    for (const candidate of candidates) await this.#applyIceCandidate(candidate);
  }

  async #waitForIceGathering(): Promise<void> {
    if (this.#connection.iceGatheringState === "complete") return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#connection.removeEventListener("icegatheringstatechange", handleState);
        reject(new RtcConnectionError("RTC_ICE_GATHERING_TIMEOUT", "RTC ICE gathering timed out"));
      }, this.#iceGatheringTimeoutMs);
      const handleState = () => {
        if (this.#connection.iceGatheringState !== "complete") return;
        clearTimeout(timeout);
        this.#connection.removeEventListener("icegatheringstatechange", handleState);
        resolve();
      };
      this.#connection.addEventListener("icegatheringstatechange", handleState);
    });
  }
}
