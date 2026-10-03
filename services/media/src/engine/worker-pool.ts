import type {
  Router,
  RouterRtpCodecCapability,
  WebRtcServer,
  WebRtcTransport,
  Worker,
  WorkerSettings,
} from "mediasoup/types";

import type { MediaConfig } from "../config/environment.js";
import { MediaEngineError } from "./errors.js";
import type {
  MediaEngine,
  MediaEngineCapacity,
  MediaEngineHealth,
  MediaRoomRequest,
  ParticipantTransport,
  ParticipantTransportRequest,
  PublishedTrack,
  TrackSubscription,
} from "./media-engine.js";
import type { MediasoupWorkerFactory } from "./mediasoup-factory.js";

const mediaCodecs: RouterRtpCodecCapability[] = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48_000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90_000 },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90_000,
    parameters: {
      "level-asymmetry-allowed": 1,
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
    },
  },
];

interface WorkerSlot {
  alive: boolean;
  rooms: number;
  webRtcServer: WebRtcServer;
  worker: Worker;
}

interface RoomState {
  router: Router;
  slot: WorkerSlot;
  transports: Map<string, WebRtcTransport>;
}

export class MediasoupWorkerPool implements MediaEngine {
  readonly #config: MediaConfig;
  readonly #createWorker: MediasoupWorkerFactory;
  readonly #pendingRooms = new Map<string, Promise<void>>();
  readonly #rooms = new Map<string, RoomState>();
  readonly #workers: WorkerSlot[] = [];
  #closed = false;

  constructor(config: MediaConfig, createWorker: MediasoupWorkerFactory) {
    this.#config = config;
    this.#createWorker = createWorker;
  }

  async start(): Promise<void> {
    if (this.#closed) throw new MediaEngineError("NOT_READY", "The media engine is closed");
    if (this.#workers.length > 0) return;

    try {
      for (let index = 0; index < this.#config.workerCount; index += 1) {
        const worker = await this.#createWorker(this.#workerSettings());
        const webRtcServer = await worker.createWebRtcServer({
          appData: { nodeId: this.#config.nodeId, workerIndex: index },
          listenInfos: [
            {
              announcedAddress: this.#config.rtcAnnouncedAddress,
              ip: this.#config.rtcListenIp,
              port: this.#config.rtcPort + index,
              protocol: "udp",
            },
            {
              announcedAddress: this.#config.rtcAnnouncedAddress,
              ip: this.#config.rtcListenIp,
              port: this.#config.rtcPort + index,
              protocol: "tcp",
            },
          ],
        });
        const slot: WorkerSlot = { alive: true, rooms: 0, webRtcServer, worker };
        worker.on("died", () => {
          this.#handleWorkerDeath(slot);
        });
        this.#workers.push(slot);
      }
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled(this.#pendingRooms.values());
    for (const room of this.#rooms.values()) room.router.close();
    this.#rooms.clear();
    for (const slot of this.#workers) {
      slot.alive = false;
      slot.webRtcServer.close();
      slot.worker.close();
    }
    this.#workers.length = 0;
  }

  createRoom(request: MediaRoomRequest): Promise<void> {
    this.#assertReady();
    if (this.#rooms.has(request.roomId)) return Promise.resolve();
    const pending = this.#pendingRooms.get(request.roomId);
    if (pending) return pending;
    const creation = this.#createRoom(request).finally(() => {
      this.#pendingRooms.delete(request.roomId);
    });
    this.#pendingRooms.set(request.roomId, creation);
    return creation;
  }

  async #createRoom(request: MediaRoomRequest): Promise<void> {
    const slot = this.#selectWorker();
    slot.rooms += 1;
    let router: Router;
    try {
      router = await slot.worker.createRouter({
        appData: { roomId: request.roomId },
        mediaCodecs,
      });
    } catch (error) {
      slot.rooms -= 1;
      throw error;
    }
    const state: RoomState = { router, slot, transports: new Map() };
    this.#rooms.set(request.roomId, state);
    router.observer.once("close", () => {
      if (this.#rooms.get(request.roomId) !== state) return;
      this.#rooms.delete(request.roomId);
      slot.rooms = Math.max(0, slot.rooms - 1);
    });
  }

  closeRoom(request: MediaRoomRequest): Promise<void> {
    const room = this.#rooms.get(request.roomId);
    if (!room) return Promise.resolve();
    room.router.close();
    return Promise.resolve();
  }

  getRouterCapabilities(
    request: MediaRoomRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const room = this.#getRoom(request.roomId);
    return Promise.resolve(room.router.rtpCapabilities);
  }

  async createParticipantTransport(
    request: ParticipantTransportRequest,
  ): Promise<ParticipantTransport> {
    const room = this.#getRoom(request.roomId);
    if (room.transports.size >= this.#config.maxTransportsPerRoom) {
      throw new MediaEngineError(
        "CAPACITY_EXCEEDED",
        `Room ${request.roomId} reached its transport capacity`,
      );
    }
    const transport = await room.router.createWebRtcTransport({
      appData: {
        direction: request.direction,
        participantId: request.participantId,
        roomId: request.roomId,
      },
      enableTcp: true,
      enableUdp: true,
      preferUdp: true,
      webRtcServer: room.slot.webRtcServer,
    });
    room.transports.set(transport.id, transport);
    transport.observer.once("close", () => room.transports.delete(transport.id));
    return {
      direction: request.direction,
      dtlsParameters: transport.dtlsParameters as unknown as Readonly<Record<string, unknown>>,
      iceCandidates: transport.iceCandidates as unknown as readonly Readonly<
        Record<string, unknown>
      >[],
      iceParameters: transport.iceParameters as unknown as Readonly<Record<string, unknown>>,
      id: transport.id,
    };
  }

  getCapacity(): MediaEngineCapacity {
    let transports = 0;
    for (const room of this.#rooms.values()) transports += room.transports.size;
    return {
      maxRooms: this.#config.workerCount * this.#config.maxRoomsPerWorker,
      maxTransportsPerRoom: this.#config.maxTransportsPerRoom,
      rooms: this.#rooms.size,
      transports,
      workers: this.#workers.length,
    };
  }

  async getHealth(): Promise<MediaEngineHealth> {
    const liveWorkers = this.#workers.filter((slot) => slot.alive && !slot.worker.closed);
    const checks = await Promise.allSettled(
      liveWorkers.map((slot) => slot.worker.getResourceUsage()),
    );
    const workersAlive = checks.filter((check) => check.status === "fulfilled").length;
    return {
      capacity: this.getCapacity(),
      healthy: !this.#closed && workersAlive === this.#config.workerCount,
      workersAlive,
    };
  }

  publishTrack(): Promise<PublishedTrack> {
    return Promise.reject(
      new MediaEngineError("UNSUPPORTED_OPERATION", "Track publishing is introduced in Phase 6.3"),
    );
  }

  subscribeTrack(): Promise<TrackSubscription> {
    return Promise.reject(
      new MediaEngineError("UNSUPPORTED_OPERATION", "Track subscriptions are introduced in Phase 6.3"),
    );
  }

  #assertReady(): void {
    if (this.#closed || this.#workers.length !== this.#config.workerCount) {
      throw new MediaEngineError("NOT_READY", "The media worker pool is not ready");
    }
  }

  #getRoom(roomId: string): RoomState {
    this.#assertReady();
    const room = this.#rooms.get(roomId);
    if (!room) throw new MediaEngineError("NOT_FOUND", `Media room ${roomId} was not found`);
    return room;
  }

  #handleWorkerDeath(slot: WorkerSlot): void {
    if (!slot.alive) return;
    slot.alive = false;
    for (const [roomId, room] of this.#rooms) {
      if (room.slot === slot) {
        room.router.close();
        this.#rooms.delete(roomId);
      }
    }
    slot.rooms = 0;
  }

  #selectWorker(): WorkerSlot {
    const candidates = this.#workers
      .filter((slot) => slot.alive && slot.rooms < this.#config.maxRoomsPerWorker)
      .sort((left, right) => left.rooms - right.rooms);
    const slot = candidates[0];
    if (!slot) throw new MediaEngineError("CAPACITY_EXCEEDED", "Media room capacity is exhausted");
    return slot;
  }

  #workerSettings(): WorkerSettings {
    return {
      appData: { nodeId: this.#config.nodeId },
      logLevel: this.#config.nodeEnvironment === "production" ? "warn" : "debug",
      logTags: ["ice", "dtls", "rtp", "rtcp"],
    };
  }
}
