import { describe, expect, it, vi } from "vitest";

import { MediaConnection } from "./media-connection.js";
import { TestPeerConnection } from "./rtc-test-fixtures.js";
import { mediaEnvironment, mediaStream, mediaTrack } from "./test-fixtures.js";

describe("MediaConnection", () => {
  it("publishes microphone and camera tracks", async () => {
    const microphone = mediaTrack("audio", "mic-1");
    const camera = mediaTrack("video", "cam-1");
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(mediaStream(microphone))
      .mockResolvedValueOnce(mediaStream(camera));
    const peer = new TestPeerConnection();
    const connection = new MediaConnection({
      mediaEnvironment: mediaEnvironment({ getUserMedia }),
      peerConnectionFactory: () => peer.asPeerConnection(),
    });

    await connection.enableMicrophone();
    await connection.enableCamera({ width: 1280 });

    expect(peer.addTrack).toHaveBeenNthCalledWith(1, microphone);
    expect(peer.addTrack).toHaveBeenNthCalledWith(2, camera);
  });

  it("replaces the live sender when an input device changes", async () => {
    const first = mediaTrack("audio", "mic-1");
    const second = mediaTrack("audio", "mic-2");
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValueOnce(mediaStream(first))
      .mockResolvedValueOnce(mediaStream(second));
    const peer = new TestPeerConnection();
    const connection = new MediaConnection({
      mediaEnvironment: mediaEnvironment({ getUserMedia }),
      peerConnectionFactory: () => peer.asPeerConnection(),
    });

    await connection.enableMicrophone();
    await connection.switchMicrophone("mic-2");

    expect(peer.sender.replaceTrack).toHaveBeenCalledWith(second);
    expect(first.stop).toHaveBeenCalledOnce();
  });

  it("removes senders and releases devices", async () => {
    const microphone = mediaTrack("audio", "mic-1");
    const peer = new TestPeerConnection();
    const connection = new MediaConnection({
      mediaEnvironment: mediaEnvironment({
        getUserMedia: () => Promise.resolve(mediaStream(microphone)),
      }),
      peerConnectionFactory: () => peer.asPeerConnection(),
    });

    await connection.enableMicrophone();
    connection.disableMicrophone();

    expect(peer.removeTrack).toHaveBeenCalledWith(peer.sender);
    expect(microphone.stop).toHaveBeenCalledOnce();
  });
});
