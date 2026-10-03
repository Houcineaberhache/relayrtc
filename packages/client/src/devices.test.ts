import { describe, expect, it, vi } from "vitest";

import { MediaDeviceCatalog } from "./devices.js";
import { mediaDevice, mediaEnvironment } from "./test-fixtures.js";

describe("MediaDeviceCatalog", () => {
  it("enumerates microphone and camera inputs separately", async () => {
    const environment = mediaEnvironment({
      enumerateDevices: () => Promise.resolve([
        mediaDevice("audioinput", "mic-1", "Desk microphone"),
        mediaDevice("videoinput", "cam-1", "Front camera"),
        mediaDevice("audiooutput", "speaker-1", "Speakers"),
      ]),
    });
    const snapshot = await new MediaDeviceCatalog(environment).enumerate();

    expect(snapshot.microphones).toEqual([
      {
        deviceId: "mic-1",
        groupId: "group-mic-1",
        kind: "audioinput",
        label: "Desk microphone",
      },
    ]);
    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0]?.deviceId).toBe("cam-1");
  });

  it("publishes updated devices and unsubscribes", async () => {
    const environment = mediaEnvironment({
      enumerateDevices: () =>
        Promise.resolve([mediaDevice("audioinput", "mic-1", "Microphone")]),
    });
    const catalog = new MediaDeviceCatalog(environment);
    const listener = vi.fn();
    const unsubscribe = catalog.subscribe(listener);

    environment.mediaDevices.dispatchEvent(new Event("devicechange"));
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledOnce();
    });
    unsubscribe();
    environment.mediaDevices.dispatchEvent(new Event("devicechange"));

    expect(listener).toHaveBeenCalledOnce();
  });
});
