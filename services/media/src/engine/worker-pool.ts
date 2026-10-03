import type {
  Consumer,
  Producer,
  RtpCapabilities,
  RtpParameters,
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
  IngestSubscriberStatsRequest,
  MediaRoomRequest,
  ConnectTransportRequest,
  ParticipantTransport,
  ParticipantTransportRequest,
  PublishedTrack,
  PublishTrackRequest,
  RemoveTrackRequest,
  RestartTransportRequest,
  SetPriorityRequest,
  SetSubscriptionQualityRequest,
  SubscribeTrackRequest,
  TrackSubscription,
} from "./media-engine.js";
import type { MediasoupWorkerFactory } from "./mediasoup-factory.js";
import type { ConnectionQuality } from "@relayrtc/types";
import type { QualityEventPublisher } from "../quality/quality-event-publisher.js";
import { qualityEvent } from "../quality/quality-event-publisher.js";
import type { QualityMetricsStore } from "../quality/quality-metrics-store.js";
import {
  classifyConnectionQuality,
  intervalNetworkStats,
  qualityTransitionEvent,
} from "../quality/quality-model.js";
import {
  preferredLayers,
  selectVideoQuality,
  type MediaPriority,
  type SelectedVideoQuality,
  type SubscriberNetworkStats,
  type SubscriberQualityMode,
} from "./quality-controller.js";

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
  consumers: Map<string, ConsumerState>;
  participantPriorities: Map<string, MediaPriority>;
  participantQualities: Map<string, ConnectionQuality>;
  participantStats: Map<string, SubscriberNetworkStats>;
  producers: Map<string, Producer>;
  router: Router;
  slot: WorkerSlot;
  transports: Map<string, TransportState>;
}

export interface MediaQualityOptions {
  eventPublisher?: QualityEventPublisher;
  metricsStore?: QualityMetricsStore;
}

interface ConsumerState {
  consumer: Consumer;
  participantId: string;
  quality: SubscriberQualityMode;
  selectedQuality: SelectedVideoQuality | null;
}

interface TransportState {
  direction: "receive" | "send";
  participantId: string;
  transport: WebRtcTransport;
}

export class MediasoupWorkerPool implements MediaEngine {
  readonly #config: MediaConfig;
  readonly #createWorker: MediasoupWorkerFactory;
  readonly #quality: MediaQualityOptions;
  readonly #pendingRooms = new Map<string, Promise<void>>();
  readonly #rooms = new Map<string, RoomState>();
  readonly #workers: WorkerSlot[] = [];
  #closed = false;

  constructor(
    config: MediaConfig,
    createWorker: MediasoupWorkerFactory,
    quality: MediaQualityOptions = {},
  ) {
    this.#config = config;
    this.#createWorker = createWorker;
    this.#quality = quality;
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
    const state: RoomState = {
      consumers: new Map(),
      participantPriorities: new Map(),
      participantQualities: new Map(),
      participantStats: new Map(),
      producers: new Map(),
      router,
      slot,
      transports: new Map(),
    };
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

  getRouterCapabilities(request: MediaRoomRequest): Promise<Readonly<Record<string, unknown>>> {
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
    room.transports.set(transport.id, {
      direction: request.direction,
      participantId: request.participantId,
      transport,
    });
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

  async connectParticipantTransport(request: ConnectTransportRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const transport = this.#getOwnedTransport(room, request.transportId, request.participantId);
    await transport.connect({ dtlsParameters: request.dtlsParameters as never });
  }

  async restartParticipantTransport(
    request: RestartTransportRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const room = this.#getRoom(request.roomId);
    const transport = this.#getOwnedTransport(room, request.transportId, request.participantId);
    return transport.restartIce();
  }

  listPublishedTracks(request: MediaRoomRequest): Promise<readonly PublishedTrack[]> {
    const room = this.#getRoom(request.roomId);
    return Promise.resolve(
      [...room.producers.values()].map((producer) => ({
        id: producer.id,
        kind: producer.kind,
        participantId: String(producer.appData.participantId),
        trackType: producer.appData.trackType as PublishedTrack["trackType"],
        priority:
          (producer.appData.priority as MediaPriority | undefined) ??
          room.participantPriorities.get(String(producer.appData.participantId)) ??
          "normal",
      })),
    );
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

  async publishTrack(request: PublishTrackRequest): Promise<PublishedTrack> {
    const room = this.#getRoom(request.roomId);
    const transport = this.#getParticipantTransport(
      room,
      request.transportId,
      request.participantId,
      "send",
    );
    const expectedKind =
      request.trackType === "audio" || request.trackType === "screen_audio" ? "audio" : "video";
    if (request.kind !== expectedKind) {
      throw new MediaEngineError(
        "INVALID_REQUEST",
        `Track type ${request.trackType} requires ${expectedKind} media`,
      );
    }
    const producer = await transport.produce({
      appData: {
        participantId: request.participantId,
        roomId: request.roomId,
        trackType: request.trackType,
        ...(request.priority ? { priority: request.priority } : {}),
      },
      kind: request.kind,
      rtpParameters: request.rtpParameters as RtpParameters,
    });
    room.producers.set(producer.id, producer);
    producer.observer.once("close", () => room.producers.delete(producer.id));
    return {
      id: producer.id,
      kind: producer.kind,
      participantId: request.participantId,
      trackType: request.trackType,
      priority:
        request.priority ?? room.participantPriorities.get(request.participantId) ?? "normal",
    };
  }

  async subscribeTrack(request: SubscribeTrackRequest): Promise<TrackSubscription> {
    const room = this.#getRoom(request.roomId);
    const producer = room.producers.get(request.trackId);
    if (!producer) {
      throw new MediaEngineError("NOT_FOUND", `Media track ${request.trackId} was not found`);
    }
    if (producer.appData.participantId === request.participantId) {
      throw new MediaEngineError(
        "INVALID_REQUEST",
        "Participants cannot subscribe to their own tracks",
      );
    }
    const transport = this.#getParticipantTransport(
      room,
      request.transportId,
      request.participantId,
      "receive",
    );
    const rtpCapabilities = request.rtpCapabilities as RtpCapabilities;
    if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
      throw new MediaEngineError(
        "INVALID_REQUEST",
        `Participant cannot consume media track ${request.trackId}`,
      );
    }
    const consumer = await transport.consume({
      appData: { participantId: request.participantId, roomId: request.roomId },
      paused: false,
      producerId: producer.id,
      rtpCapabilities,
    });
    const priority =
      (producer.appData.priority as MediaPriority | undefined) ??
      room.participantPriorities.get(String(producer.appData.participantId)) ??
      "normal";
    const quality = request.quality ?? "auto";
    const selectedQuality = consumer.kind === "video" && quality !== "auto" ? quality : null;
    room.consumers.set(consumer.id, {
      consumer,
      participantId: request.participantId,
      quality,
      selectedQuality,
    });
    consumer.observer.once("close", () => room.consumers.delete(consumer.id));
    await consumer.setPriority(priority === "high" ? 255 : priority === "low" ? 1 : 127);
    if (selectedQuality) await this.#applyQuality(consumer, selectedQuality);
    return {
      id: consumer.id,
      kind: consumer.kind,
      producerId: producer.id,
      rtpParameters: consumer.rtpParameters,
      trackId: producer.id,
      trackType: producer.appData.trackType as TrackSubscription["trackType"],
      priority,
      quality: selectedQuality,
    };
  }

  async ingestSubscriberStats(request: IngestSubscriberStatsRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const stats = intervalNetworkStats(
      request.stats,
      room.participantStats.get(request.participantId),
    );
    room.participantStats.set(request.participantId, request.stats);
    const quality = classifyConnectionQuality(stats);
    await this.#quality.metricsStore?.record({
      participantId: request.participantId,
      quality,
      roomId: request.roomId,
      stats,
    });
    const previousQuality = room.participantQualities.get(request.participantId);
    const eventType = qualityTransitionEvent(previousQuality, quality);
    if (eventType && previousQuality) {
      await this.#quality.eventPublisher?.publish(
        eventType,
        qualityEvent(request.roomId, request.participantId, previousQuality, quality),
      );
    }
    room.participantQualities.set(request.participantId, quality);
    for (const state of room.consumers.values()) {
      if (
        state.participantId !== request.participantId ||
        state.consumer.kind !== "video" ||
        state.quality !== "auto"
      )
        continue;
      const producer = room.producers.get(state.consumer.producerId);
      const priority =
        (producer?.appData.priority as MediaPriority | undefined) ??
        room.participantPriorities.get(String(producer?.appData.participantId)) ??
        "normal";
      const selected = selectVideoQuality(stats, priority);
      if (selected === state.selectedQuality) continue;
      await this.#applyQuality(state.consumer, selected);
      state.selectedQuality = selected;
    }
  }

  async setSubscriptionQuality(request: SetSubscriptionQualityRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const state = room.consumers.get(request.subscriptionId);
    if (!state)
      throw new MediaEngineError(
        "NOT_FOUND",
        `Subscription ${request.subscriptionId} was not found`,
      );
    if (state.participantId !== request.participantId)
      throw new MediaEngineError("FORBIDDEN", "The subscription belongs to another participant");
    state.quality = request.quality;
    if (state.consumer.kind === "video" && request.quality !== "auto") {
      await this.#applyQuality(state.consumer, request.quality);
      state.selectedQuality = request.quality;
    }
  }

  async setTrackPriority(request: SetPriorityRequest & { trackId: string }): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const producer = room.producers.get(request.trackId);
    if (!producer)
      throw new MediaEngineError("NOT_FOUND", `Media track ${request.trackId} was not found`);
    if (producer.appData.participantId !== request.participantId)
      throw new MediaEngineError("FORBIDDEN", "A participant can only prioritize their own tracks");
    producer.appData.priority = request.priority;
    await this.#setProducerConsumerPriorities(room, producer.id, request.priority);
  }

  async setParticipantPriority(request: SetPriorityRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    room.participantPriorities.set(request.participantId, request.priority);
    const producers = [...room.producers.values()].filter(
      (producer) =>
        producer.appData.participantId === request.participantId &&
        producer.appData.priority === undefined,
    );
    await Promise.all(
      producers.map((producer) =>
        this.#setProducerConsumerPriorities(room, producer.id, request.priority),
      ),
    );
  }

  removeTrack(request: RemoveTrackRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const producer = room.producers.get(request.trackId);
    if (!producer) return Promise.resolve();
    if (producer.appData.participantId !== request.participantId) {
      return Promise.reject(
        new MediaEngineError("FORBIDDEN", "A participant can only remove their own tracks"),
      );
    }
    for (const [consumerId, state] of room.consumers) {
      if (state.consumer.producerId === producer.id) {
        state.consumer.close();
        room.consumers.delete(consumerId);
      }
    }
    producer.close();
    room.producers.delete(producer.id);
    return Promise.resolve();
  }

  async #applyQuality(consumer: Consumer, quality: SelectedVideoQuality): Promise<void> {
    if (quality === "audio-only") {
      if (!consumer.paused) await consumer.pause();
      return;
    }
    if (consumer.paused) await consumer.resume();
    await consumer.setPreferredLayers(preferredLayers[quality]);
  }

  async #setProducerConsumerPriorities(
    room: RoomState,
    producerId: string,
    priority: MediaPriority,
  ): Promise<void> {
    const value = priority === "high" ? 255 : priority === "low" ? 1 : 127;
    await Promise.all(
      [...room.consumers.values()]
        .filter((state) => state.consumer.producerId === producerId)
        .map((state) => state.consumer.setPriority(value)),
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

  #getParticipantTransport(
    room: RoomState,
    transportId: string,
    participantId: string,
    direction: "receive" | "send",
  ): WebRtcTransport {
    const state = room.transports.get(transportId);
    if (!state) throw new MediaEngineError("NOT_FOUND", `Transport ${transportId} was not found`);
    if (state.participantId !== participantId) {
      throw new MediaEngineError("FORBIDDEN", "The transport belongs to another participant");
    }
    if (state.direction !== direction) {
      throw new MediaEngineError(
        "INVALID_REQUEST",
        `A ${direction} transport is required for this operation`,
      );
    }
    return state.transport;
  }

  #getOwnedTransport(room: RoomState, transportId: string, participantId: string): WebRtcTransport {
    const state = room.transports.get(transportId);
    if (!state) throw new MediaEngineError("NOT_FOUND", `Transport ${transportId} was not found`);
    if (state.participantId !== participantId) {
      throw new MediaEngineError("FORBIDDEN", "The transport belongs to another participant");
    }
    return state.transport;
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
