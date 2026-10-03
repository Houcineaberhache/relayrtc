import { describe, expect, it, vi, type Mock } from "vitest";

import type { MediaConfig } from "../config/environment.js";
import { MediaEngineError } from "./errors.js";
import { createMediasoupTestHarness } from "./mediasoup-test-fixtures.js";
import { MediasoupWorkerPool } from "./worker-pool.js";

const config: MediaConfig = {
  databaseUrl: "postgresql://relaykit:password@localhost:5432/relaykit",
  internalSecret: "test-internal-secret-at-least-32-characters",
  host: "127.0.0.1",
  logLevel: "silent",
  maxRoomsPerWorker: 1,
  maxTransportsPerRoom: 1,
  nodeEnvironment: "test",
  nodeId: "media-test",
  port: 8082,
  rtcAnnouncedAddress: "127.0.0.1",
  rtcListenIp: "127.0.0.1",
  rtcMaxPort: 40_003,
  rtcPort: 40_000,
  workerCount: 2,
  signalingInternalUrl: "http://signaling:8081/internal/v1",
};

describe("MediasoupWorkerPool", () => {
  it("starts workers and reports healthy capacity", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);

    await pool.start();

    expect(factory).toHaveBeenCalledTimes(2);
    expect(await pool.getHealth()).toEqual({
      capacity: {
        maxRooms: 2,
        maxTransportsPerRoom: 1,
        rooms: 0,
        transports: 0,
        workers: 2,
      },
      healthy: true,
      workersAlive: 2,
    });
    await pool.close();
  });

  it("balances rooms and enforces room capacity", async () => {
    const { factory, routerFactories } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();

    await pool.createRoom({ roomId: "room-1" });
    await pool.createRoom({ roomId: "room-2" });

    expect(routerFactories[0]).toHaveBeenCalledOnce();
    expect(routerFactories[1]).toHaveBeenCalledOnce();
    await expect(pool.createRoom({ roomId: "room-3" })).rejects.toEqual(
      expect.objectContaining<Partial<MediaEngineError>>({ code: "CAPACITY_EXCEEDED" }),
    );
    await pool.close();
  });

  it("creates WebRTC transports and enforces transport capacity", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });

    const transport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "participant-1",
      roomId: "room-1",
    });

    expect(transport).toEqual(
      expect.objectContaining({ direction: "send", id: "transport-0-0-0" }),
    );
    await expect(
      pool.createParticipantTransport({
        direction: "receive",
        participantId: "participant-1",
        roomId: "room-1",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MediaEngineError>>({ code: "CAPACITY_EXCEEDED" }),
    );
    await pool.close();
  });

  it("publishes audio and video tracks and creates subscriptions", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool({ ...config, maxTransportsPerRoom: 2 }, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });
    const sendTransport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "participant-1",
      roomId: "room-1",
    });
    const receiveTransport = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "participant-2",
      roomId: "room-1",
    });

    const audio = await pool.publishTrack({
      kind: "audio",
      trackType: "audio",
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      transportId: sendTransport.id,
    });
    const video = await pool.publishTrack({
      kind: "video",
      trackType: "camera_video",
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      transportId: sendTransport.id,
    });
    const subscription = await pool.subscribeTrack({
      participantId: "participant-2",
      roomId: "room-1",
      rtpCapabilities: { codecs: [] },
      trackId: audio.id,
      transportId: receiveTransport.id,
    });

    expect(audio).toEqual(expect.objectContaining({ kind: "audio" }));
    expect(video).toEqual(expect.objectContaining({ kind: "video" }));
    expect(subscription).toEqual(
      expect.objectContaining({ kind: "audio", producerId: audio.id, trackId: audio.id }),
    );
    await pool.close();
  });

  it("only allows a track owner to remove a published track", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });
    const transport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "participant-1",
      roomId: "room-1",
    });
    const track = await pool.publishTrack({
      kind: "audio",
      trackType: "audio",
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      transportId: transport.id,
    });

    await expect(
      pool.removeTrack({
        participantId: "participant-2",
        roomId: "room-1",
        trackId: track.id,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<MediaEngineError>>({ code: "FORBIDDEN" }));
    await expect(
      pool.removeTrack({
        participantId: "participant-1",
        roomId: "room-1",
        trackId: track.id,
      }),
    ).resolves.toBeUndefined();
    await pool.close();
  });

  it("closes participant producers and subscriptions during session cleanup", async () => {
    const { consumers, factory, producers } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool({ ...config, maxTransportsPerRoom: 2 }, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });
    const send = await pool.createParticipantTransport({
      direction: "send",
      participantId: "participant-1",
      roomId: "room-1",
    });
    const receive = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "participant-2",
      roomId: "room-1",
    });
    const track = await pool.publishTrack({
      kind: "video",
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      trackType: "camera_video",
      transportId: send.id,
    });
    await pool.subscribeTrack({
      participantId: "participant-2",
      roomId: "room-1",
      rtpCapabilities: { codecs: [] },
      trackId: track.id,
      transportId: receive.id,
    });

    await pool.removeParticipant({ participantId: "participant-1", roomId: "room-1" });

    expect(vi.mocked(producers[0]!.close)).toHaveBeenCalledOnce();
    expect(vi.mocked(consumers[0]!.close)).toHaveBeenCalledOnce();
    await expect(pool.listPublishedTracks({ roomId: "room-1" })).resolves.toEqual([]);
    await pool.close();
  });

  it("selects video layers from subscriber stats and supports audio-only fallback", async () => {
    const { consumers, factory } = createMediasoupTestHarness();
    const publish = vi.fn(() => Promise.resolve());
    const record = vi.fn(() => Promise.resolve());
    const pool = new MediasoupWorkerPool({ ...config, maxTransportsPerRoom: 2 }, factory, {
      eventPublisher: { publish },
      metricsStore: { record },
    });
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });
    const send = await pool.createParticipantTransport({
      direction: "send",
      participantId: "publisher",
      roomId: "room-1",
    });
    const receive = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "subscriber",
      roomId: "room-1",
    });
    const track = await pool.publishTrack({
      kind: "video",
      participantId: "publisher",
      roomId: "room-1",
      rtpParameters: { encodings: [{ rid: "q" }, { rid: "h" }, { rid: "f" }] },
      trackType: "camera_video",
      transportId: send.id,
    });
    const autoSubscription = await pool.subscribeTrack({
      participantId: "subscriber",
      roomId: "room-1",
      rtpCapabilities: { codecs: [] },
      trackId: track.id,
      transportId: receive.id,
    });

    await pool.ingestSubscriberStats({
      participantId: "subscriber",
      roomId: "room-1",
      stats: {
        availableIncomingBitrate: 3_000_000,
        jitter: 0.01,
        packetsLost: 1,
        packetsReceived: 99,
        roundTripTime: 0.1,
        timestamp: 1,
      },
    });
    const consumer = consumers[0];
    expect(consumer).toBeDefined();
    const qualityConsumer = consumer as unknown as {
      pause: Mock;
      resume: Mock;
      setPreferredLayers: Mock;
    };
    await pool.setSubscriptionQuality({
      participantId: "subscriber",
      quality: "audio-only",
      roomId: "room-1",
      subscriptionId: autoSubscription.id,
    });
    await pool.setSubscriptionQuality({
      participantId: "subscriber",
      quality: "auto",
      roomId: "room-1",
      subscriptionId: autoSubscription.id,
    });
    expect(qualityConsumer.resume).toHaveBeenCalledOnce();
    expect(qualityConsumer.setPreferredLayers).toHaveBeenCalledWith({
      spatialLayer: 2,
      temporalLayer: 2,
    });
    qualityConsumer.pause.mockClear();
    qualityConsumer.setPreferredLayers.mockClear();
    await pool.ingestSubscriberStats({
      participantId: "subscriber",
      roomId: "room-1",
      stats: {
        availableIncomingBitrate: 50_000,
        jitter: 0.2,
        packetsLost: 25,
        packetsReceived: 75,
        roundTripTime: 1,
        timestamp: 2,
      },
    });
    expect(qualityConsumer.pause).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(
      "connection.degraded",
      expect.objectContaining({
        participantId: "subscriber",
        previousQuality: "excellent",
        quality: "critical",
      }),
    );
    await pool.close();
  });

  it("connects and restarts transports and lists published tracks", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-1" });
    const transport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "participant-1",
      roomId: "room-1",
    });

    await expect(
      pool.connectParticipantTransport({
        dtlsParameters: { fingerprints: [], role: "auto" },
        participantId: "participant-1",
        roomId: "room-1",
        transportId: transport.id,
      }),
    ).resolves.toBeUndefined();
    await expect(
      pool.restartParticipantTransport({
        participantId: "participant-1",
        roomId: "room-1",
        transportId: transport.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ usernameFragment: "new-user" }));
    const track = await pool.publishTrack({
      kind: "audio",
      trackType: "audio",
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      transportId: transport.id,
    });
    await expect(pool.listPublishedTracks({ roomId: "room-1" })).resolves.toEqual([track]);
    await pool.close();
  });
});
