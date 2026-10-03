import { describe, expect, it, vi } from "vitest";

import { MediaCaptureError } from "./errors.js";
import { MediaPermissionManager } from "./permissions.js";
import { mediaEnvironment, mediaStream, mediaTrack } from "./test-fixtures.js";

describe("MediaPermissionManager", () => {
  it("reports microphone and camera permission states", async () => {
    const environment = mediaEnvironment({
      queryPermission: (descriptor) =>
        Promise.resolve({
          state:
            (descriptor as PermissionDescriptor & { name: string }).name === "microphone"
              ? "granted"
              : "prompt",
        } as PermissionStatus),
    });

    await expect(new MediaPermissionManager(environment).get()).resolves.toEqual({
      microphone: "granted",
      camera: "prompt",
    });
  });

  it("requests selected permissions and releases temporary tracks", async () => {
    const microphone = mediaTrack("audio", "mic-1");
    const getUserMedia = vi.fn(() => Promise.resolve(mediaStream(microphone)));
    const manager = new MediaPermissionManager(mediaEnvironment({ getUserMedia }));

    await manager.request({ microphone: true, camera: false });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(microphone.stop).toHaveBeenCalledOnce();
  });

  it("returns a stable permission error", async () => {
    const manager = new MediaPermissionManager(
      mediaEnvironment({
        getUserMedia: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      }),
    );

    await expect(manager.request()).rejects.toEqual(
      expect.objectContaining<Partial<MediaCaptureError>>({ code: "MEDIA_PERMISSION_DENIED" }),
    );
  });
});
