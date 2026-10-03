import { normalizeMediaError } from "./errors.js";
import type { BrowserMediaEnvironment } from "./environment.js";
import type {
  MediaPermissionRequest,
  MediaPermissionsSnapshot,
  MediaPermissionState,
} from "./types.js";

const queryPermission = async (
  permissions: Permissions | undefined,
  name: "microphone" | "camera",
): Promise<MediaPermissionState> => {
  if (!permissions) return "unsupported";
  try {
    const status = await permissions.query({ name });
    return status.state;
  } catch {
    return "unsupported";
  }
};

export class MediaPermissionManager {
  readonly #environment: BrowserMediaEnvironment;

  constructor(environment: BrowserMediaEnvironment) {
    this.#environment = environment;
  }

  async get(): Promise<MediaPermissionsSnapshot> {
    const [microphone, camera] = await Promise.all([
      queryPermission(this.#environment.permissions, "microphone"),
      queryPermission(this.#environment.permissions, "camera"),
    ]);
    return { microphone, camera };
  }

  async request(request: MediaPermissionRequest = {}): Promise<MediaPermissionsSnapshot> {
    const microphone = request.microphone ?? true;
    const camera = request.camera ?? true;
    if (!microphone && !camera) return this.get();

    try {
      const stream = await this.#environment.mediaDevices.getUserMedia({
        audio: microphone,
        video: camera,
      });
      for (const track of stream.getTracks()) track.stop();
      return await this.get();
    } catch (error) {
      throw normalizeMediaError(error);
    }
  }
}
