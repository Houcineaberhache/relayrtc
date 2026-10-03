import { MediaDeviceCatalog } from "./devices.js";
import {
  browserMediaEnvironment,
  type BrowserMediaEnvironment,
} from "./environment.js";
import { LocalMediaTrackController } from "./local-media-track.js";
import { MediaPermissionManager } from "./permissions.js";

export class MediaManager {
  readonly camera: LocalMediaTrackController;
  readonly devices: MediaDeviceCatalog;
  readonly microphone: LocalMediaTrackController;
  readonly permissions: MediaPermissionManager;

  constructor(environment: BrowserMediaEnvironment = browserMediaEnvironment()) {
    this.camera = new LocalMediaTrackController("camera", environment);
    this.devices = new MediaDeviceCatalog(environment);
    this.microphone = new LocalMediaTrackController("microphone", environment);
    this.permissions = new MediaPermissionManager(environment);
  }

  dispose(): void {
    this.microphone.disable();
    this.camera.disable();
  }
}
