export const timestamp = "2026-10-01T00:00:00Z";

export const room = {
  id: "room_123",
  projectId: "project_123",
  environmentId: "environment_123",
  name: "Daily standup",
  metadata: {},
  status: "active",
  maxParticipants: 25,
  createdAt: timestamp,
  startedAt: timestamp,
  endedAt: null,
};

export const participant = {
  id: "participant_123",
  roomId: "room_123",
  externalId: "customer_123",
  name: "Amina",
  metadata: {},
  role: "speaker",
  joinedAt: timestamp,
  leftAt: null,
};

export const session = {
  id: "session_123",
  participantId: "participant_123",
  signalingNodeId: "signaling_1",
  mediaNodeId: "media_1",
  connectionState: "connected",
  transportType: "udp",
  joinedAt: timestamp,
  disconnectedAt: null,
  reconnectedAt: null,
};

export const track = {
  id: "track_123",
  roomId: "room_123",
  participantId: "participant_123",
  sessionId: "session_123",
  type: "camera_video",
  state: "published",
  priority: "normal",
  metadata: {},
  publishedAt: timestamp,
  unpublishedAt: null,
};

export function request(type: string, payload: unknown) {
  return {
    v: 1,
    id: "message_123",
    sentAt: timestamp,
    type,
    payload,
  };
}

export function response(type: string, payload: unknown) {
  return {
    ...request(type, payload),
    requestId: "request_123",
  };
}
