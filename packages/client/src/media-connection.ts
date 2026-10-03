import type { BrowserMediaEnvironment } from "./environment.js";
import { browserMediaEnvironment } from "./environment.js";
import { MediaManager } from "./media-manager.js";
import type { PeerConnectionFactory } from "./rtc-environment.js";
import { browserPeerConnectionFactory } from "./rtc-environment.js";
import { RtcConnection } from "./rtc-connection.js";
import type { RtcConnectionOptions } from "./rtc-types.js";
import { simulcastEncodings } from "./quality.js";

export interface MediaConnectionOptions extends RtcConnectionOptions {
  readonly mediaEnvironment?: BrowserMediaEnvironment;
  readonly peerConnectionFactory?: PeerConnectionFactory;
}

export class MediaConnection {
  readonly media: MediaManager;
  readonly rtc: RtcConnection;
  #cameraSender: RTCRtpSender | null = null;
  #microphoneSender: RTCRtpSender | null = null;
  #screenAudioSender: RTCRtpSender | null = null;
  #screenVideoSender: RTCRtpSender | null = null;

  constructor(options: MediaConnectionOptions = {}) {
    this.media = new MediaManager(options.mediaEnvironment ?? browserMediaEnvironment());
    this.rtc = new RtcConnection(
      {
        ...(options.configuration ? { configuration: options.configuration } : {}),
        ...(options.iceGatheringTimeoutMs
          ? { iceGatheringTimeoutMs: options.iceGatheringTimeoutMs }
          : {}),
      },
      options.peerConnectionFactory ?? browserPeerConnectionFactory,
    );
    this.media.screen.subscribe((screen) => {
      if (!screen.active) this.#removeScreenSenders();
    });
  }

  async enableMicrophone(constraints: MediaTrackConstraints = {}): Promise<MediaStreamTrack> {
    const track = await this.media.microphone.enable(constraints);
    if (this.#microphoneSender) await this.rtc.replaceTrack(this.#microphoneSender, track);
    else this.#microphoneSender = this.rtc.addTrack(track);
    return track;
  }

  async enableCamera(constraints: MediaTrackConstraints = {}): Promise<MediaStreamTrack> {
    const track = await this.media.camera.enable(constraints);
    if (this.#cameraSender) await this.rtc.replaceTrack(this.#cameraSender, track);
    else this.#cameraSender = this.rtc.addSimulcastTrack(track, simulcastEncodings);
    return track;
  }

  async switchMicrophone(deviceId: string): Promise<MediaStreamTrack | null> {
    const track = await this.media.microphone.switchDevice(deviceId);
    if (track && this.#microphoneSender) {
      await this.rtc.replaceTrack(this.#microphoneSender, track);
    }
    return track;
  }

  async switchCamera(deviceId: string): Promise<MediaStreamTrack | null> {
    const track = await this.media.camera.switchDevice(deviceId);
    if (track && this.#cameraSender) await this.rtc.replaceTrack(this.#cameraSender, track);
    return track;
  }

  disableMicrophone(): void {
    if (this.#microphoneSender) this.rtc.removeTrack(this.#microphoneSender);
    this.#microphoneSender = null;
    this.media.microphone.disable();
  }

  disableCamera(): void {
    if (this.#cameraSender) this.rtc.removeTrack(this.#cameraSender);
    this.#cameraSender = null;
    this.media.camera.disable();
  }

  async startScreenShare(
    options: DisplayMediaStreamOptions = { video: true },
  ): Promise<readonly MediaStreamTrack[]> {
    const screen = await this.media.screen.start(options);
    if (!screen.videoTrack) return [];
    this.#screenVideoSender = this.rtc.addSimulcastTrack(screen.videoTrack, simulcastEncodings);
    if (screen.audioTrack) this.#screenAudioSender = this.rtc.addTrack(screen.audioTrack);
    return screen.audioTrack ? [screen.videoTrack, screen.audioTrack] : [screen.videoTrack];
  }

  stopScreenShare(): void {
    this.#removeScreenSenders();
    this.media.screen.stop();
  }

  close(): void {
    this.#microphoneSender = null;
    this.#cameraSender = null;
    this.#screenAudioSender = null;
    this.#screenVideoSender = null;
    this.media.dispose();
    this.rtc.close();
  }

  #removeScreenSenders(): void {
    if (this.#screenVideoSender) this.rtc.removeTrack(this.#screenVideoSender);
    if (this.#screenAudioSender) this.rtc.removeTrack(this.#screenAudioSender);
    this.#screenVideoSender = null;
    this.#screenAudioSender = null;
  }
}
