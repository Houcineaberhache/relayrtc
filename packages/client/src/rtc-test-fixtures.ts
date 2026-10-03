import { vi, type Mock } from "vitest";

export type TestRtcSender = Omit<RTCRtpSender, "replaceTrack"> & {
  readonly replaceTrack: Mock<(track: MediaStreamTrack | null) => Promise<void>>;
};

export const rtcSender = () =>
  ({
    replaceTrack: vi.fn(() => Promise.resolve()),
  }) as unknown as TestRtcSender;

export class TestPeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  signalingState: RTCSignalingState = "stable";
  readonly sender = rtcSender();
  readonly #listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  readonly addTrack: Mock<(track: MediaStreamTrack) => TestRtcSender> = vi.fn(() => this.sender);
  readonly addTransceiver: Mock<() => RTCRtpTransceiver> = vi.fn(
    () => ({ sender: this.sender }) as unknown as RTCRtpTransceiver,
  );
  readonly getStats: Mock<() => Promise<RTCStatsReport>> = vi.fn(() =>
    Promise.resolve(new Map() as unknown as RTCStatsReport),
  );
  readonly removeTrack: Mock<(sender: RTCRtpSender) => void> = vi.fn();
  readonly createOffer: Mock<(options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>> =
    vi.fn(() => Promise.resolve({ type: "offer", sdp: "offer-sdp" } as RTCSessionDescriptionInit));
  readonly createAnswer: Mock<() => Promise<RTCSessionDescriptionInit>> = vi.fn(() =>
    Promise.resolve({ type: "answer", sdp: "answer-sdp" } as RTCSessionDescriptionInit),
  );
  readonly setLocalDescription: Mock<(value: RTCSessionDescriptionInit) => Promise<void>> = vi.fn(
    (value) => {
      this.localDescription = value as RTCSessionDescription;
      return Promise.resolve();
    },
  );
  readonly setRemoteDescription: Mock<(value: RTCSessionDescriptionInit) => Promise<void>> = vi.fn(
    (value) => {
      this.remoteDescription = value as RTCSessionDescription;
      return Promise.resolve();
    },
  );
  readonly addIceCandidate: Mock<(candidate?: RTCIceCandidateInit | null) => Promise<void>> = vi.fn(
    () => Promise.resolve(),
  );
  readonly restartIce: Mock<() => void> = vi.fn();
  readonly close: Mock<() => void> = vi.fn(() => {
    this.connectionState = "closed";
    this.signalingState = "closed";
  });

  addEventListener(name: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.#listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: EventListenerOrEventListenerObject): void {
    this.#listeners.get(name)?.delete(listener);
  }

  emit(name: string, event: Event = new Event(name)): void {
    for (const listener of this.#listeners.get(name) ?? []) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
  }

  asPeerConnection(): RTCPeerConnection {
    return this as unknown as RTCPeerConnection;
  }
}
