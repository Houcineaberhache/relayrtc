import { describe, expect, it } from "vitest";

import type { MediaConfig } from "../config/environment.js";
import { MediaEngineError } from "./errors.js";
import { createMediasoupTestHarness } from "./mediasoup-test-fixtures.js";
import type { ParticipantTransport, PublishedTrack } from "./media-engine.js";
import { MediasoupWorkerPool } from "./worker-pool.js";

const config: MediaConfig = {
  host: "127.0.0.1",
  logLevel: "silent",
  maxRoomsPerWorker: 1,
  maxTransportsPerRoom: 6,
  nodeEnvironment: "test",
  nodeId: "media-group-video-test",
  port: 8082,
  rtcAnnouncedAddress: "127.0.0.1",
  rtcListenIp: "127.0.0.1",
  rtcMaxPort: 40_000,
  rtcPort: 40_000,
  workerCount: 1,
};

const participants = ["alice", "bob", "carol"] as const;
const videoRtpParameters = {
  codecs: [{ clockRate: 90_000, mimeType: "video/VP8", payloadType: 96 }],
  encodings: [
    { maxBitrate: 150_000, rid: "low", scaleResolutionDownBy: 4 },
    { maxBitrate: 500_000, rid: "medium", scaleResolutionDownBy: 2 },
    { maxBitrate: 1_500_000, rid: "high", scaleResolutionDownBy: 1 },
  ],
};

describe("group video rooms", () => {
  it("routes every camera to every other participant", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "video-room" });

    const sendTransports = new Map<string, ParticipantTransport>();
    const receiveTransports = new Map<string, ParticipantTransport>();
    for (const participantId of participants) {
      sendTransports.set(
        participantId,
        await pool.createParticipantTransport({
          direction: "send",
          participantId,
          roomId: "video-room",
        }),
      );
      receiveTransports.set(
        participantId,
        await pool.createParticipantTransport({
          direction: "receive",
          participantId,
          roomId: "video-room",
        }),
      );
    }

    const tracks = new Map<string, PublishedTrack>();
    for (const participantId of participants) {
      const transport = sendTransports.get(participantId);
      if (!transport) throw new Error(`Missing send transport for ${participantId}`);
      tracks.set(
        participantId,
        await pool.publishTrack({
          kind: "video",
          trackType: "camera_video",
          participantId,
          roomId: "video-room",
          rtpParameters: videoRtpParameters,
          transportId: transport.id,
        }),
      );
    }

    const subscriptions = [];
    for (const subscriberId of participants) {
      const transport = receiveTransports.get(subscriberId);
      if (!transport) throw new Error(`Missing receive transport for ${subscriberId}`);
      for (const publisherId of participants) {
        if (publisherId === subscriberId) continue;
        const track = tracks.get(publisherId);
        if (!track) throw new Error(`Missing video track for ${publisherId}`);
        subscriptions.push(
          await pool.subscribeTrack({
            participantId: subscriberId,
            roomId: "video-room",
            rtpCapabilities: { codecs: [{ mimeType: "video/VP8" }] },
            trackId: track.id,
            transportId: transport.id,
          }),
        );
      }
    }

    expect(tracks.size).toBe(3);
    expect(subscriptions).toHaveLength(6);
    expect(new Set(subscriptions.map((subscription) => subscription.id)).size).toBe(6);
    expect(subscriptions.every((subscription) => subscription.kind === "video")).toBe(true);
    expect(subscriptions.every((subscription) => subscription.rtpParameters === videoRtpParameters))
      .toBe(true);
    await pool.close();
  });

  it("stops new subscriptions after a camera track is removed", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "video-room" });
    const sendTransport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "alice",
      roomId: "video-room",
    });
    const receiveTransport = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "bob",
      roomId: "video-room",
    });
    const track = await pool.publishTrack({
      kind: "video",
      trackType: "camera_video",
      participantId: "alice",
      roomId: "video-room",
      rtpParameters: videoRtpParameters,
      transportId: sendTransport.id,
    });

    await pool.removeTrack({ participantId: "alice", roomId: "video-room", trackId: track.id });

    await expect(
      pool.subscribeTrack({
        participantId: "bob",
        roomId: "video-room",
        rtpCapabilities: { codecs: [{ mimeType: "video/VP8" }] },
        trackId: track.id,
        transportId: receiveTransport.id,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<MediaEngineError>>({ code: "NOT_FOUND" }));
    await pool.close();
  });
});
