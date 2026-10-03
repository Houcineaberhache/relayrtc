import { describe, expect, it, vi } from "vitest";

import { ScreenShareController } from "./screen-share.js";
import { mediaEnvironment, mediaStream, mediaTrack } from "./test-fixtures.js";

const displayTrack = (kind: "audio" | "video", deviceId: string) => {
  const track = mediaTrack(kind, deviceId);
  const listeners = new Map<string, EventListenerOrEventListenerObject>();
  Object.assign(track, {
    addEventListener: vi.fn((name: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(name, listener);
    }),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  });
  return {
    emitEnded: () => {
      const listener = listeners.get("ended");
      if (typeof listener === "function") listener(new Event("ended"));
      else listener?.handleEvent(new Event("ended"));
    },
    track,
  };
};

describe("ScreenShareController", () => {
  it("captures display video with optional system audio", async () => {
    const video = displayTrack("video", "display-1");
    const audio = displayTrack("audio", "display-audio-1");
    const getDisplayMedia = vi.fn(() => Promise.resolve(mediaStream(video.track, audio.track)));
    const controller = new ScreenShareController(mediaEnvironment({ getDisplayMedia }));

    const result = await controller.start({ video: true, audio: true });

    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(result).toEqual({ active: true, videoTrack: video.track, audioTrack: audio.track });
  });

  it("stops every display track when browser sharing ends", async () => {
    const video = displayTrack("video", "display-1");
    const audio = displayTrack("audio", "display-audio-1");
    const controller = new ScreenShareController(
      mediaEnvironment({
        getDisplayMedia: () => Promise.resolve(mediaStream(video.track, audio.track)),
      }),
    );
    const snapshots = vi.fn();
    controller.subscribe(snapshots);
    await controller.start({ video: true, audio: true });

    video.emitEnded();

    expect(video.track.stop).toHaveBeenCalledOnce();
    expect(audio.track.stop).toHaveBeenCalledOnce();
    expect(controller.current.active).toBe(false);
    expect(snapshots).toHaveBeenLastCalledWith({
      active: false,
      videoTrack: null,
      audioTrack: null,
    });
  });
});
