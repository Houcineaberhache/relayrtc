export type MediaKind = "audio" | "video";
export type MediaTrackType = "audio" | "camera_video" | "screen_audio" | "screen_video";
export type MediaTransportDirection = "receive" | "send";
import type {
  MediaPriority,
  SelectedVideoQuality,
  SubscriberNetworkStats,
  SubscriberQualityMode,
} from "./quality-controller.js";

export interface MediaRoomRequest {
  roomId: string;
}

export interface ParticipantTransportRequest extends MediaRoomRequest {
  direction: MediaTransportDirection;
  participantId: string;
}

export interface ParticipantTransport {
  direction: MediaTransportDirection;
  dtlsParameters: Readonly<Record<string, unknown>>;
  id: string;
  iceCandidates: readonly Readonly<Record<string, unknown>>[];
  iceParameters: Readonly<Record<string, unknown>>;
}

export interface ConnectTransportRequest extends MediaRoomRequest {
  dtlsParameters: Readonly<Record<string, unknown>>;
  participantId: string;
  transportId: string;
}

export interface RestartTransportRequest extends MediaRoomRequest {
  participantId: string;
  transportId: string;
}

export interface MediaEngineCapacity {
  maxRooms: number;
  maxTransportsPerRoom: number;
  rooms: number;
  transports: number;
  workers: number;
}

export interface MediaEngineHealth {
  capacity: MediaEngineCapacity;
  healthy: boolean;
  workersAlive: number;
}

export interface PublishTrackRequest extends MediaRoomRequest {
  kind: MediaKind;
  participantId: string;
  rtpParameters: Readonly<Record<string, unknown>>;
  transportId: string;
  trackType: MediaTrackType;
  priority?: MediaPriority;
}

export interface PublishedTrack {
  id: string;
  kind: MediaKind;
  participantId: string;
  trackType: MediaTrackType;
  priority: MediaPriority;
}

export interface RemoveTrackRequest extends MediaRoomRequest {
  participantId: string;
  trackId: string;
}

export interface SubscribeTrackRequest extends MediaRoomRequest {
  participantId: string;
  rtpCapabilities: Readonly<Record<string, unknown>>;
  trackId: string;
  transportId: string;
  quality?: SubscriberQualityMode;
}

export interface TrackSubscription {
  id: string;
  kind: MediaKind;
  producerId: string;
  rtpParameters: Readonly<Record<string, unknown>>;
  trackId: string;
  trackType: MediaTrackType;
  priority: MediaPriority;
  quality: SelectedVideoQuality | null;
}

export interface IngestSubscriberStatsRequest extends MediaRoomRequest {
  participantId: string;
  stats: SubscriberNetworkStats;
}

export interface SetSubscriptionQualityRequest extends MediaRoomRequest {
  participantId: string;
  quality: SubscriberQualityMode;
  subscriptionId: string;
}

export interface SetPriorityRequest extends MediaRoomRequest {
  participantId: string;
  priority: MediaPriority;
}

export interface MediaEngine {
  close(): Promise<void>;
  closeRoom(request: MediaRoomRequest): Promise<void>;
  connectParticipantTransport(request: ConnectTransportRequest): Promise<void>;
  createParticipantTransport(request: ParticipantTransportRequest): Promise<ParticipantTransport>;
  createRoom(request: MediaRoomRequest): Promise<void>;
  getCapacity(): MediaEngineCapacity;
  getHealth(): Promise<MediaEngineHealth>;
  ingestSubscriberStats(request: IngestSubscriberStatsRequest): Promise<void>;
  listPublishedTracks(request: MediaRoomRequest): Promise<readonly PublishedTrack[]>;
  getRouterCapabilities(request: MediaRoomRequest): Promise<Readonly<Record<string, unknown>>>;
  publishTrack(request: PublishTrackRequest): Promise<PublishedTrack>;
  removeTrack(request: RemoveTrackRequest): Promise<void>;
  restartParticipantTransport(
    request: RestartTransportRequest,
  ): Promise<Readonly<Record<string, unknown>>>;
  start(): Promise<void>;
  setParticipantPriority(request: SetPriorityRequest): Promise<void>;
  setSubscriptionQuality(request: SetSubscriptionQualityRequest): Promise<void>;
  setTrackPriority(request: SetPriorityRequest & { trackId: string }): Promise<void>;
  subscribeTrack(request: SubscribeTrackRequest): Promise<TrackSubscription>;
}
