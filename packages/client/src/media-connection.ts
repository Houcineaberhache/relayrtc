import type { BrowserMediaEnvironment } from "./environment.js";
import { browserMediaEnvironment } from "./environment.js";
import { MediaManager } from "./media-manager.js";
import type { PeerConnectionFactory } from "./rtc-environment.js";
import { browserPeerConnectionFactory } from "./rtc-environment.js";
import { RtcConnection } from "./rtc-connection.js";
import type { RtcConnectionOptions } from "./rtc-types.js";

export interface MediaConnectionOptions extends RtcConnectionOptions {
  readonly mediaEnvironment?: BrowserMediaEnvironment;
  readonly peerConnectionFactory?: PeerConnectionFactory;
}

export class MediaConnection {
  readonly media: MediaManager;
  readonly rtc: RtcConnection;
  #cameraSender: RTCRtpSender | null = null;
  #microphoneSender: RTCRtpSender | null = null;

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
    else this.#cameraSender = this.rtc.addTrack(track);
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

  close(): void {
    this.#microphoneSender = null;
    this.#cameraSender = null;
    this.media.dispose();
    this.rtc.close();
  }
}
