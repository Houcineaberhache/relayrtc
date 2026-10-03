import { describe, expect, it, vi } from "vitest";

import { LocalMediaTrackController } from "./local-media-track.js";
import { mediaEnvironment, mediaStream, mediaTrack } from "./test-fixtures.js";

describe("LocalMediaTrackController", () => {
  it("captures and stops a microphone", async () => {
    const microphone = mediaTrack("audio", "mic-1");
    const getUserMedia = vi.fn(() => Promise.resolve(mediaStream(microphone)));
    const controller = new LocalMediaTrackController(
      "microphone",
      mediaEnvironment({ getUserMedia }),
    );

    await expect(controller.enable({ echoCancellation: true })).resolves.toBe(microphone);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true },
      video: false,
    });
    expect(controller.current).toEqual({
      source: "microphone",
      deviceId: "mic-1",
      enabled: true,
      track: microphone,
    });

    controller.disable();
    expect(microphone.stop).toHaveBeenCalledOnce();
    expect(controller.current.enabled).toBe(false);
  });

  it("switches an active camera without stopping it before replacement", async () => {
    const first = mediaTrack("video", "cam-1");
    const second = mediaTrack("video", "cam-2");
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockResolvedValueOnce(mediaStream(first))
      .mockResolvedValueOnce(mediaStream(second));
    const controller = new LocalMediaTrackController(
      "camera",
      mediaEnvironment({ getUserMedia }),
    );

    await controller.enable({ width: 1280 });
    await expect(controller.switchDevice("cam-2")).resolves.toBe(second);

    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: { width: 1280, deviceId: { exact: "cam-2" } },
    });
    expect(first.stop).toHaveBeenCalledOnce();
    expect(controller.current.track).toBe(second);
    expect(controller.current.deviceId).toBe("cam-2");
  });

  it("remembers a selected device before capture begins", async () => {
    const microphone = mediaTrack("audio", "mic-2");
    const getUserMedia = vi.fn(() => Promise.resolve(mediaStream(microphone)));
    const controller = new LocalMediaTrackController(
      "microphone",
      mediaEnvironment({ getUserMedia }),
    );

    await expect(controller.switchDevice("mic-2")).resolves.toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    await controller.enable();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-2" } },
      video: false,
    });
  });

  it("notifies subscribers when capture state changes", async () => {
    const microphone = mediaTrack("audio", "mic-1");
    const controller = new LocalMediaTrackController(
      "microphone",
      mediaEnvironment({ getUserMedia: () => Promise.resolve(mediaStream(microphone)) }),
    );
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    await controller.enable();
    controller.disable();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ enabled: false, track: null }),
    );
  });
});
