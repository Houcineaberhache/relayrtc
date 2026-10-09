import { randomUUID } from "node:crypto";
import { MediaDurationMeter } from "../usage/media-duration-meter.js";
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
import { roomQualityModeSettings, type ConnectionQuality } from "@relayrtc/types";

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
  ResumeSubscriptionRequest,
  RemoveParticipantRequest,
  RestartTransportRequest,
  SetPriorityRequest,
  SetParticipantQualityModeRequest,
  SetSubscriptionQualityRequest,
  SubscribeTrackRequest,
  TrackSubscription,
} from "./media-engine.js";
import type { MediasoupWorkerFactory } from "./mediasoup-factory.js";
import type { QualityEventPublisher } from "../quality/quality-event-publisher.js";
import { qualityEvent } from "../quality/quality-event-publisher.js";
import type { QualityMetricsStore } from "../quality/quality-metrics-store.js";
import type { MediaUsageMetric, MediaUsageMetricsStore } from "../usage/usage-metrics-store.js";
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

interface TurnUsageState {
  stats: SubscriberNetworkStats;
  recording?: Promise<void> | undefined;
  pending?: {
    id: string;
    stats: SubscriberNetworkStats;
    metrics: Partial<Record<MediaUsageMetric, number>>;
    occurredAt: Date;
  };
}

interface RoomState {
  turnUsage: Map<string, TurnUsageState>;
  durationMeter: MediaDurationMeter | undefined;
  consumers: Map<string, ConsumerState>;
  consumerUsage: Map<string, UsageSampleState>;
  participantPriorities: Map<string, MediaPriority>;
  participantQualities: Map<string, ConnectionQuality>;
  participantQualityPreferences: Map<string, SubscriberQualityMode>;
  participantStats: Map<string, SubscriberNetworkStats>;
  producers: Map<string, Producer>;
  producerUsage: Map<string, UsageSampleState>;
  router: Router;
  slot: WorkerSlot;
  transports: Map<string, TransportState>;
}

export interface MediaQualityOptions {
  eventPublisher?: QualityEventPublisher;
  metricsStore?: QualityMetricsStore;
  usageMetricsStore?: MediaUsageMetricsStore;
  onUsageError?: (error: unknown) => void;
}

interface ConsumerState {
  negotiationTimer?: ReturnType<typeof setTimeout>;
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

interface UsageSampleState {
  pending?: {
    id: string;
    bytes: number;
    sampledAt: number;
    metrics: Partial<Record<MediaUsageMetric, number>>;
  };
  recording?: Promise<void> | undefined;
  bytes: number;
  sampledAt: number;
}

export class MediasoupWorkerPool implements MediaEngine {
  readonly #config: MediaConfig;
  readonly #createWorker: MediasoupWorkerFactory;
  readonly #quality: MediaQualityOptions;
  readonly #pendingRooms = new Map<string, Promise<void>>();
  readonly #rooms = new Map<string, RoomState>();
  readonly #workers: WorkerSlot[] = [];
  #closed = false;
  #usageFlush: Promise<void> | null = null;

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
    if (this.#usageFlush) await this.#usageFlush;
    for (const room of this.#rooms.values())
      for (const producer of room.producers.values()) room.durationMeter?.stop(producer.id);
    await this.flushUsage();
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
      consumerUsage: new Map(),
      durationMeter: this.#quality.usageMetricsStore
        ? new MediaDurationMeter(this.#quality.usageMetricsStore)
        : undefined,
      participantPriorities: new Map(),
      participantQualities: new Map(),
      participantQualityPreferences: new Map(),
      participantStats: new Map(),
      turnUsage: new Map(),
      producers: new Map(),
      producerUsage: new Map(),
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

  async closeRoom(request: MediaRoomRequest): Promise<void> {
    const room = this.#rooms.get(request.roomId);
    if (!room) return;
    await Promise.all([
      ...[...room.consumers.values()].map((state) =>
        this.#recordConsumerUsage(
          request.roomId,
          state.consumer,
          room.consumerUsage.get(state.consumer.id),
        ),
      ),
      ...[...room.producers.values()].map((producer) =>
        this.#recordProducerUsage(request.roomId, producer, room.producerUsage.get(producer.id)),
      ),
    ]);
    for (const producer of room.producers.values()) room.durationMeter?.stop(producer.id);
    await this.#flushTurnUsage(request.roomId, room);
    await this.#flushDurations(request.roomId, room);
    room.router.close();
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
    room.durationMeter?.start(producer.id, request.participantId, request.trackType);
    room.producerUsage.set(producer.id, { bytes: 0, sampledAt: Date.now() });
    producer.observer.once("close", () => {
      room.durationMeter?.stop(producer.id);
      room.producers.delete(producer.id);
      room.producerUsage.delete(producer.id);
    });
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
      paused: true,
      producerId: producer.id,
      rtpCapabilities,
    });
    const priority =
      (producer.appData.priority as MediaPriority | undefined) ??
      room.participantPriorities.get(String(producer.appData.participantId)) ??
      "normal";
    const quality =
      request.quality ?? room.participantQualityPreferences.get(request.participantId) ?? "auto";
    const selectedQuality = consumer.kind === "video" && quality !== "auto" ? quality : null;
    room.consumers.set(consumer.id, {
      consumer,
      participantId: request.participantId,
      quality,
      selectedQuality,
    });
    room.consumerUsage.set(consumer.id, { bytes: 0, sampledAt: Date.now() });
    consumer.observer.once("close", () => {
      clearTimeout(room.consumers.get(consumer.id)?.negotiationTimer);
      room.consumers.delete(consumer.id);
      room.consumerUsage.delete(consumer.id);
    });
    try {
      await consumer.setPriority(priority === "high" ? 255 : priority === "low" ? 1 : 127);
      if (selectedQuality && selectedQuality !== "audio-only") {
        await consumer.setPreferredLayers(preferredLayers[selectedQuality]);
      }
      const state = room.consumers.get(consumer.id);
      if (!state || consumer.closed) {
        throw new MediaEngineError("NOT_FOUND", "The subscription closed during negotiation");
      }
      state.negotiationTimer = setTimeout(() => {
        consumer.close();
      }, 60_000);
      state.negotiationTimer.unref();
    } catch (error) {
      consumer.close();
      throw error;
    }
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

  async resumeSubscription(request: ResumeSubscriptionRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const state = room.consumers.get(request.subscriptionId);
    if (!state) {
      throw new MediaEngineError(
        "NOT_FOUND",
        `Subscription ${request.subscriptionId} was not found`,
      );
    }
    if (state.participantId !== request.participantId) {
      throw new MediaEngineError("FORBIDDEN", "The subscription belongs to another participant");
    }
    clearTimeout(state.negotiationTimer);
    delete state.negotiationTimer;
    try {
      if (state.quality !== "audio-only" && state.consumer.paused) await state.consumer.resume();
    } catch (error) {
      state.consumer.close();
      throw error;
    }
  }

  async removeSubscription(request: ResumeSubscriptionRequest): Promise<void> {
    const room = this.#rooms.get(request.roomId);
    const state = room?.consumers.get(request.subscriptionId);
    if (!room || !state) return;
    if (state.participantId !== request.participantId) {
      throw new MediaEngineError("FORBIDDEN", "The subscription belongs to another participant");
    }
    await this.#recordConsumerUsage(
      request.roomId,
      state.consumer,
      room.consumerUsage.get(request.subscriptionId),
    );
    state.consumer.close();
  }

  async ingestSubscriberStats(request: IngestSubscriberStatsRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const previousStats = room.participantStats.get(request.participantId);
    const stats = intervalNetworkStats(request.stats, previousStats);
    await this.#recordTurnUsage(room, request);
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
      if (selected === state.selectedQuality) {
        if (selected === "audio-only" && !state.consumer.paused) await state.consumer.pause();
        if (selected !== "audio-only" && state.consumer.paused) await state.consumer.resume();
        continue;
      }
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
    if (state.consumer.kind !== "video") return;
    if (request.quality !== "auto") {
      await this.#applyQuality(state.consumer, request.quality);
      state.selectedQuality = request.quality;
      return;
    }
    const producer = room.producers.get(state.consumer.producerId);
    const priority =
      (producer?.appData.priority as MediaPriority | undefined) ??
      room.participantPriorities.get(String(producer?.appData.participantId)) ??
      "normal";
    const stats = room.participantStats.get(request.participantId);
    const selected = stats ? selectVideoQuality(stats, priority) : "720p";
    await this.#applyQuality(state.consumer, selected);
    state.selectedQuality = selected;
  }

  async setParticipantQualityMode(request: SetParticipantQualityModeRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const quality = roomQualityModeSettings[request.mode].receive;
    room.participantQualityPreferences.set(request.participantId, quality);
    await Promise.all(
      [...room.consumers.entries()]
        .filter(([, state]) => state.participantId === request.participantId)
        .map(([subscriptionId]) =>
          this.setSubscriptionQuality({
            participantId: request.participantId,
            quality,
            roomId: request.roomId,
            subscriptionId,
          }),
        ),
    );
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

  async removeTrack(request: RemoveTrackRequest): Promise<void> {
    const room = this.#getRoom(request.roomId);
    const producer = room.producers.get(request.trackId);
    if (!producer) return;
    if (producer.appData.participantId !== request.participantId) {
      throw new MediaEngineError("FORBIDDEN", "A participant can only remove their own tracks");
    }
    await this.#recordProducerUsage(request.roomId, producer, room.producerUsage.get(producer.id));
    for (const [consumerId, state] of room.consumers) {
      if (state.consumer.producerId === producer.id) {
        await this.#recordConsumerUsage(
          request.roomId,
          state.consumer,
          room.consumerUsage.get(consumerId),
        );
        state.consumer.close();
        room.consumers.delete(consumerId);
      }
    }
    room.durationMeter?.stop(producer.id);
    await this.#flushDurations(request.roomId, room);
    producer.close();
    room.producers.delete(producer.id);
  }

  async removeParticipant(request: RemoveParticipantRequest): Promise<void> {
    const room = this.#rooms.get(request.roomId);
    if (!room) return;
    const ownedProducerIds = new Set(
      [...room.producers.values()]
        .filter((producer) => producer.appData.participantId === request.participantId)
        .map((producer) => producer.id),
    );
    for (const [consumerId, state] of room.consumers) {
      if (
        state.participantId === request.participantId ||
        ownedProducerIds.has(state.consumer.producerId)
      ) {
        await this.#recordConsumerUsage(
          request.roomId,
          state.consumer,
          room.consumerUsage.get(consumerId),
        );
        state.consumer.close();
        room.consumers.delete(consumerId);
      }
    }
    for (const producerId of ownedProducerIds) {
      const producer = room.producers.get(producerId);
      if (producer) {
        await this.#recordProducerUsage(
          request.roomId,
          producer,
          room.producerUsage.get(producerId),
        );
        room.durationMeter?.stop(producerId);
        await this.#flushDurations(request.roomId, room);
        producer.close();
      }
      room.producers.delete(producerId);
    }
    for (const [transportId, state] of room.transports) {
      if (state.participantId === request.participantId) {
        state.transport.close();
        room.transports.delete(transportId);
      }
    }
    room.participantPriorities.delete(request.participantId);
    room.participantQualities.delete(request.participantId);
    room.participantQualityPreferences.delete(request.participantId);
    room.participantStats.delete(request.participantId);
    await this.#flushTurnUsage(request.roomId, room);
    room.turnUsage.delete(request.participantId);
  }

  async #recordTurnUsage(room: RoomState, request: IngestSubscriberStatsRequest): Promise<void> {
    const store = this.#quality.usageMetricsStore;
    if (!store) return;
    const state = room.turnUsage.get(request.participantId);
    if (!state) {
      room.turnUsage.set(request.participantId, { stats: request.stats });
      return;
    }
    const operation = (state.recording ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const delta = (next = 0, previous = 0) => (next >= previous ? next - previous : next);
          state.pending ??= {
            id: randomUUID(),
            stats: request.stats,
            occurredAt: new Date(),
            metrics: {
              turnIngressBytes: delta(request.stats.turnBytesSent, state.stats.turnBytesSent),
              turnEgressBytes: delta(
                request.stats.turnBytesReceived,
                state.stats.turnBytesReceived,
              ),
            },
          };
          const pending = state.pending;
          if (store.recordBatch)
            await store.recordBatch(
              request.roomId,
              pending.id,
              pending.metrics,
              pending.occurredAt,
            );
          else {
            await store.record(
              request.roomId,
              "turnIngressBytes",
              pending.metrics.turnIngressBytes ?? 0,
            );
            await store.record(
              request.roomId,
              "turnEgressBytes",
              pending.metrics.turnEgressBytes ?? 0,
            );
          }
          state.stats = pending.stats;
          delete state.pending;
          if (pending.stats === request.stats) return;
        }
      });
    state.recording = operation;
    try {
      await operation;
    } finally {
      if (state.recording === operation) state.recording = undefined;
    }
  }

  async #recordSample(
    roomId: string,
    sample: UsageSampleState | undefined,
    collect: () => Promise<{
      bytes: number;
      sampledAt: number;
      metrics: Partial<Record<MediaUsageMetric, number>>;
    }>,
  ): Promise<void> {
    const store = this.#quality.usageMetricsStore;
    if (!store || !sample) return;
    if (sample.recording) return sample.recording;
    sample.recording = (async () => {
      try {
        sample.pending ??= { id: randomUUID(), ...(await collect()) };
        const pending = sample.pending;
        if (store.recordBatch) {
          await store.recordBatch(roomId, pending.id, pending.metrics, new Date(pending.sampledAt));
        } else {
          for (const [metric, value] of Object.entries(pending.metrics)) {
            await store.record(roomId, metric as MediaUsageMetric, value);
          }
        }
        sample.bytes = pending.bytes;
        sample.sampledAt = pending.sampledAt;
        delete sample.pending;
      } catch (error) {
        this.#quality.onUsageError?.(error);
      }
    })().finally(() => {
      sample.recording = undefined;
    });
    return sample.recording;
  }

  async #recordProducerUsage(
    roomId: string,
    producer: Producer,
    sample?: UsageSampleState,
  ): Promise<void> {
    await this.#recordSample(roomId, sample, async () => {
      const stats = await producer.getStats();
      const bytes = stats.reduce(
        (total, entry) => total + ("byteCount" in entry ? entry.byteCount : 0),
        0,
      );
      const sampledAt = Date.now();
      const delta = bytes >= (sample?.bytes ?? 0) ? bytes - (sample?.bytes ?? 0) : bytes;
      const trackType = String(producer.appData.trackType);
      return {
        bytes,
        sampledAt,
        metrics: {
          sfuIngressBytes: delta,
          ...(trackType === "screen_video" ? { screenShareIngressBytes: delta } : {}),
        },
      };
    });
  }

  async #recordConsumerUsage(
    roomId: string,
    consumer: Consumer,
    sample?: UsageSampleState,
  ): Promise<void> {
    await this.#recordSample(roomId, sample, async () => {
      const stats = await consumer.getStats();
      const bytes = stats.reduce(
        (total, entry) => total + ("byteCount" in entry ? entry.byteCount : 0),
        0,
      );
      const delta = bytes >= (sample?.bytes ?? 0) ? bytes - (sample?.bytes ?? 0) : bytes;
      const producer = this.#rooms.get(roomId)?.producers.get(consumer.producerId);
      return {
        bytes,
        sampledAt: Date.now(),
        metrics: {
          sfuEgressBytes: delta,
          ...(producer?.appData.trackType === "screen_video"
            ? { screenShareEgressBytes: delta }
            : {}),
        },
      };
    });
  }

  async flushUsage(): Promise<void> {
    if (this.#usageFlush) return this.#usageFlush;
    this.#usageFlush = this.#flushUsage().finally(() => {
      this.#usageFlush = null;
    });
    return this.#usageFlush;
  }

  async #flushTurnUsage(roomId: string, room: RoomState): Promise<void> {
    await Promise.all(
      [...room.turnUsage.entries()].map(async ([participantId, state]) => {
        if (!state.pending) return;
        try {
          await this.#recordTurnUsage(room, { roomId, participantId, stats: state.pending.stats });
        } catch (error) {
          this.#quality.onUsageError?.(error);
        }
      }),
    );
  }

  async #flushDurations(roomId: string, room: RoomState): Promise<void> {
    try {
      await room.durationMeter?.flush(roomId);
    } catch (error) {
      this.#quality.onUsageError?.(error);
    }
  }

  async #flushUsage(): Promise<void> {
    await Promise.all(
      [...this.#rooms.entries()].flatMap(([roomId, room]) => [
        this.#flushDurations(roomId, room),
        this.#flushTurnUsage(roomId, room),
        ...[...room.producers.values()].map((producer) =>
          this.#recordProducerUsage(roomId, producer, room.producerUsage.get(producer.id)),
        ),
        ...[...room.consumers.entries()].map(([consumerId, state]) =>
          this.#recordConsumerUsage(roomId, state.consumer, room.consumerUsage.get(consumerId)),
        ),
      ]),
    );
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
