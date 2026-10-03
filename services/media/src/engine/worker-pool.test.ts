import type {
  Consumer,
  Producer,
  Router,
  WebRtcServer,
  WebRtcTransport,
  Worker,
} from "mediasoup/types";
import { describe, expect, it, vi } from "vitest";

import type { MediaConfig } from "../config/environment.js";
import { MediaEngineError } from "./errors.js";
import type { MediasoupWorkerFactory } from "./mediasoup-factory.js";
import { MediasoupWorkerPool } from "./worker-pool.js";

const config: MediaConfig = {
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
};

const createTransport = (id: string): WebRtcTransport => {
  let consumerIndex = 0;
  let producerIndex = 0;
  return {
    appData: {},
    closed: false,
    consume: vi.fn((options: { producerId: string }) =>
      Promise.resolve({
        close: vi.fn(),
        id: `consumer-${id}-${String(consumerIndex++)}`,
        kind: "audio",
        observer: { once: vi.fn() },
        producerId: options.producerId,
        rtpParameters: { codecs: [] },
      } as unknown as Consumer),
    ),
    dtlsParameters: { fingerprints: [], role: "auto" },
    iceCandidates: [{ foundation: "test", ip: "127.0.0.1", port: 40_000 }],
    iceParameters: { iceLite: true, password: "password", usernameFragment: "username" },
    id,
    observer: { once: vi.fn() },
    produce: vi.fn((options: { appData: Record<string, unknown>; kind: "audio" | "video" }) =>
      Promise.resolve({
        appData: options.appData,
        close: vi.fn(),
        id: `producer-${id}-${String(producerIndex++)}`,
        kind: options.kind,
        observer: { once: vi.fn() },
      } as unknown as Producer),
    ),
  } as unknown as WebRtcTransport;
};

const createRouter = (id: string): Router => {
  let transportIndex = 0;
  return {
    canConsume: vi.fn(() => true),
    close: vi.fn(),
    closed: false,
    createWebRtcTransport: vi.fn(() =>
      Promise.resolve(createTransport(`transport-${id}-${String(transportIndex++)}`)),
    ),
    id,
    observer: { once: vi.fn() },
    rtpCapabilities: { codecs: [] },
  } as unknown as Router;
};

const createWorkerFactory = () => {
  const workers: Worker[] = [];
  const routerFactories: ReturnType<typeof vi.fn>[] = [];
  const factory: MediasoupWorkerFactory = vi.fn(() => {
    const index = workers.length;
    let routerIndex = 0;
    const createRouterMock = vi.fn(() =>
      Promise.resolve(createRouter(`${String(index)}-${String(routerIndex++)}`)),
    );
    routerFactories.push(createRouterMock);
    const worker = {
      close: vi.fn(),
      closed: false,
      createRouter: createRouterMock,
      createWebRtcServer: vi.fn(() =>
        Promise.resolve({
          close: vi.fn(),
          id: `server-${String(index)}`,
        } as unknown as WebRtcServer),
      ),
      getResourceUsage: vi.fn(() => Promise.resolve({})),
      id: `worker-${String(index)}`,
      on: vi.fn(),
    } as unknown as Worker;
    workers.push(worker);
    return Promise.resolve(worker);
  });
  return { factory, routerFactories, workers };
};

describe("MediasoupWorkerPool", () => {
  it("starts workers and reports healthy capacity", async () => {
    const { factory } = createWorkerFactory();
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
    const { factory, routerFactories } = createWorkerFactory();
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
    const { factory } = createWorkerFactory();
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
    const { factory } = createWorkerFactory();
    const pool = new MediasoupWorkerPool(
      { ...config, maxTransportsPerRoom: 2 },
      factory,
    );
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
      participantId: "participant-1",
      roomId: "room-1",
      rtpParameters: { codecs: [] },
      transportId: sendTransport.id,
    });
    const video = await pool.publishTrack({
      kind: "video",
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
    const { factory } = createWorkerFactory();
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
});
