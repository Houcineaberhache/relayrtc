import { normalizeMediaError } from "./errors.js";
import type { BrowserMediaEnvironment } from "./environment.js";
import type {
  MediaDeviceListener,
  MediaDeviceSnapshot,
  MediaInputDevice,
  MediaInputKind,
} from "./types.js";

const inputKinds = new Set<MediaDeviceKind>(["audioinput", "videoinput"]);

const toInputDevice = (device: MediaDeviceInfo): MediaInputDevice | null => {
  if (!inputKinds.has(device.kind)) return null;
  return {
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind as MediaInputKind,
    label: device.label,
  };
};

export class MediaDeviceCatalog {
  readonly #environment: BrowserMediaEnvironment;

  constructor(environment: BrowserMediaEnvironment) {
    this.#environment = environment;
  }

  async enumerate(): Promise<MediaDeviceSnapshot> {
    try {
      const devices = (await this.#environment.mediaDevices.enumerateDevices())
        .map(toInputDevice)
        .filter((device): device is MediaInputDevice => device !== null);
      return {
        microphones: devices.filter((device) => device.kind === "audioinput"),
        cameras: devices.filter((device) => device.kind === "videoinput"),
      };
    } catch (error) {
      throw normalizeMediaError(error);
    }
  }

  subscribe(listener: MediaDeviceListener): () => void {
    const handleChange = () => {
      void this.enumerate().then(listener).catch(() => undefined);
    };
    this.#environment.mediaDevices.addEventListener("devicechange", handleChange);
    return () => {
      this.#environment.mediaDevices.removeEventListener("devicechange", handleChange);
    };
  }
}
