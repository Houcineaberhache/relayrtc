import { describe, expect, it } from "vitest";

import type { MediaConfig } from "../config/environment.js";
import { createMediasoupTestHarness } from "./mediasoup-test-fixtures.js";
import { MediasoupWorkerPool } from "./worker-pool.js";

const config: MediaConfig = {
  host: "127.0.0.1",
  logLevel: "silent",
  maxRoomsPerWorker: 1,
  maxTransportsPerRoom: 4,
  nodeEnvironment: "test",
  nodeId: "media-screen-test",
  port: 8082,
  rtcAnnouncedAddress: "127.0.0.1",
  rtcListenIp: "127.0.0.1",
  rtcMaxPort: 40_000,
  rtcPort: 40_000,
  workerCount: 1,
};

describe("screen sharing", () => {
  it("publishes and subscribes to distinct screen video and audio tracks", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "screen-room" });
    const send = await pool.createParticipantTransport({
      direction: "send",
      participantId: "presenter",
      roomId: "screen-room",
    });
    const receive = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "viewer",
      roomId: "screen-room",
    });
    const screenVideo = await pool.publishTrack({
      kind: "video",
      participantId: "presenter",
      roomId: "screen-room",
      rtpParameters: { codecs: [{ mimeType: "video/VP8" }] },
      trackType: "screen_video",
      transportId: send.id,
    });
    const screenAudio = await pool.publishTrack({
      kind: "audio",
      participantId: "presenter",
      roomId: "screen-room",
      rtpParameters: { codecs: [{ mimeType: "audio/opus" }] },
      trackType: "screen_audio",
      transportId: send.id,
    });

    const videoSubscription = await pool.subscribeTrack({
      participantId: "viewer",
      roomId: "screen-room",
      rtpCapabilities: { codecs: [{ mimeType: "video/VP8" }] },
      trackId: screenVideo.id,
      transportId: receive.id,
    });
    const audioSubscription = await pool.subscribeTrack({
      participantId: "viewer",
      roomId: "screen-room",
      rtpCapabilities: { codecs: [{ mimeType: "audio/opus" }] },
      trackId: screenAudio.id,
      transportId: receive.id,
    });

    expect(screenVideo.trackType).toBe("screen_video");
    expect(screenAudio.trackType).toBe("screen_audio");
    expect(videoSubscription.trackType).toBe("screen_video");
    expect(audioSubscription.trackType).toBe("screen_audio");
    await pool.close();
  });

  it("rejects a screen track whose semantic type does not match its media kind", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "screen-room" });
    const send = await pool.createParticipantTransport({
      direction: "send",
      participantId: "presenter",
      roomId: "screen-room",
    });

    await expect(
      pool.publishTrack({
        kind: "audio",
        participantId: "presenter",
        roomId: "screen-room",
        rtpParameters: { codecs: [] },
        trackType: "screen_video",
        transportId: send.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await pool.close();
  });
});
