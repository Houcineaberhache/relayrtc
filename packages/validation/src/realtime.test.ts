import type { Participant, ParticipantSession, Room, Track } from "@relaykit/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import { participantSchema, participantSessionSchema } from "./participant.js";
import { roomSchema } from "./room.js";
import { trackSchema } from "./track.js";

const timestamp = "2026-10-01T00:00:00Z";

const room = {
  id: "room_123",
  projectId: "project_123",
  environmentId: "environment_123",
  name: "Daily standup",
  metadata: { topic: "engineering" },
  status: "active",
  maxParticipants: 25,
  createdAt: timestamp,
  startedAt: timestamp,
  endedAt: null,
};

const participant = {
  id: "participant_123",
  roomId: "room_123",
  externalId: "customer_123",
  name: "Amina",
  metadata: { handRaised: false },
  role: "speaker",
  joinedAt: timestamp,
  leftAt: null,
};

const session = {
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

const track = {
  id: "track_123",
  roomId: "room_123",
  participantId: "participant_123",
  sessionId: "session_123",
  type: "screen_video",
  state: "published",
  priority: "high",
  metadata: {},
  publishedAt: timestamp,
  unpublishedAt: null,
};

describe("realtime resource schemas", () => {
  it("parses room, participant, session, and track contracts", () => {
    const parsedRoom = roomSchema.parse(room);
    const parsedParticipant = participantSchema.parse(participant);
    const parsedSession = participantSessionSchema.parse(session);
    const parsedTrack = trackSchema.parse(track);

    expectTypeOf(parsedRoom).toEqualTypeOf<Room>();
    expectTypeOf(parsedParticipant).toEqualTypeOf<Participant>();
    expectTypeOf(parsedSession).toEqualTypeOf<ParticipantSession>();
    expectTypeOf(parsedTrack).toEqualTypeOf<Track>();
  });

  it("rejects invalid room capacity", () => {
    expect(roomSchema.safeParse({ ...room, maxParticipants: 0 }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, maxParticipants: 1.5 }).success).toBe(false);
  });

  it("rejects unsupported connection transports", () => {
    expect(participantSessionSchema.safeParse({ ...session, transportType: "quic" }).success).toBe(
      false,
    );
  });

  it("rejects unsupported track types and states", () => {
    expect(trackSchema.safeParse({ ...track, type: "camera" }).success).toBe(false);
    expect(trackSchema.safeParse({ ...track, state: "stopped" }).success).toBe(false);
  });
});
