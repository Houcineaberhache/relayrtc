export type MediaKind = "audio" | "video";
export type MediaTransportDirection = "receive" | "send";

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
  transportId: string;
}

export interface PublishedTrack {
  id: string;
  kind: MediaKind;
}

export interface SubscribeTrackRequest extends MediaRoomRequest {
  participantId: string;
  trackId: string;
  transportId: string;
}

export interface TrackSubscription {
  id: string;
  trackId: string;
}

export interface MediaEngine {
  close(): Promise<void>;
  closeRoom(request: MediaRoomRequest): Promise<void>;
  createParticipantTransport(
    request: ParticipantTransportRequest,
  ): Promise<ParticipantTransport>;
  createRoom(request: MediaRoomRequest): Promise<void>;
  getCapacity(): MediaEngineCapacity;
  getHealth(): Promise<MediaEngineHealth>;
  getRouterCapabilities(request: MediaRoomRequest): Promise<Readonly<Record<string, unknown>>>;
  publishTrack(request: PublishTrackRequest): Promise<PublishedTrack>;
  start(): Promise<void>;
  subscribeTrack(request: SubscribeTrackRequest): Promise<TrackSubscription>;
}
