import { describe, expect, it } from "vitest";

import type { MediaConfig } from "../config/environment.js";
import { MediaEngineError } from "./errors.js";
import { createMediasoupTestHarness } from "./mediasoup-test-fixtures.js";
import type { ParticipantTransport, PublishedTrack } from "./media-engine.js";
import { MediasoupWorkerPool } from "./worker-pool.js";

const config: MediaConfig = {
  databaseUrl: "postgresql://relaykit:password@localhost:5432/relaykit",
  internalSecret: "test-internal-secret-at-least-32-characters",
  host: "127.0.0.1",
  logLevel: "silent",
  maxRoomsPerWorker: 2,
  maxTransportsPerRoom: 6,
  nodeEnvironment: "test",
  nodeId: "media-group-audio-test",
  port: 8082,
  rtcAnnouncedAddress: "127.0.0.1",
  rtcListenIp: "127.0.0.1",
  rtcMaxPort: 40_000,
  rtcPort: 40_000,
  workerCount: 1,
  signalingInternalUrl: "http://signaling:8081/internal/v1",
};

const participants = ["alice", "bob", "carol"] as const;

describe("group audio rooms", () => {
  it("routes every microphone to every other participant", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "group-room" });

    const sendTransports = new Map<string, ParticipantTransport>();
    const receiveTransports = new Map<string, ParticipantTransport>();
    for (const participantId of participants) {
      sendTransports.set(
        participantId,
        await pool.createParticipantTransport({
          direction: "send",
          participantId,
          roomId: "group-room",
        }),
      );
      receiveTransports.set(
        participantId,
        await pool.createParticipantTransport({
          direction: "receive",
          participantId,
          roomId: "group-room",
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
          kind: "audio",
          trackType: "audio",
          participantId,
          roomId: "group-room",
          rtpParameters: { codecs: [{ mimeType: "audio/opus" }] },
          transportId: transport.id,
        }),
      );
    }

    const subscriptions = [];
    for (const subscriberId of participants) {
      const transport = receiveTransports.get(subscriberId);
      if (!transport) throw new Error(`Missing receive transport for ${subscriberId}`);
      for (const publisherId of participants) {
        const track = tracks.get(publisherId);
        if (!track) throw new Error(`Missing audio track for ${publisherId}`);
        if (publisherId === subscriberId) {
          await expect(
            pool.subscribeTrack({
              participantId: subscriberId,
              roomId: "group-room",
              rtpCapabilities: { codecs: [{ mimeType: "audio/opus" }] },
              trackId: track.id,
              transportId: transport.id,
            }),
          ).rejects.toEqual(
            expect.objectContaining<Partial<MediaEngineError>>({ code: "INVALID_REQUEST" }),
          );
          continue;
        }
        subscriptions.push(
          await pool.subscribeTrack({
            participantId: subscriberId,
            roomId: "group-room",
            rtpCapabilities: { codecs: [{ mimeType: "audio/opus" }] },
            trackId: track.id,
            transportId: transport.id,
          }),
        );
      }
    }

    expect(tracks.size).toBe(3);
    expect(subscriptions).toHaveLength(6);
    expect(new Set(subscriptions.map((subscription) => subscription.id)).size).toBe(6);
    expect(subscriptions.every((subscription) => subscription.kind === "audio")).toBe(true);
    await pool.close();
  });

  it("keeps audio tracks scoped to their room and removes departed tracks", async () => {
    const { factory } = createMediasoupTestHarness();
    const pool = new MediasoupWorkerPool(config, factory);
    await pool.start();
    await pool.createRoom({ roomId: "room-one" });
    await pool.createRoom({ roomId: "room-two" });
    const publisherTransport = await pool.createParticipantTransport({
      direction: "send",
      participantId: "alice",
      roomId: "room-one",
    });
    const track = await pool.publishTrack({
      kind: "audio",
      trackType: "audio",
      participantId: "alice",
      roomId: "room-one",
      rtpParameters: { codecs: [{ mimeType: "audio/opus" }] },
      transportId: publisherTransport.id,
    });
    const otherRoomTransport = await pool.createParticipantTransport({
      direction: "receive",
      participantId: "bob",
      roomId: "room-two",
    });

    await expect(
      pool.subscribeTrack({
        participantId: "bob",
        roomId: "room-two",
        rtpCapabilities: { codecs: [{ mimeType: "audio/opus" }] },
        trackId: track.id,
        transportId: otherRoomTransport.id,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<MediaEngineError>>({ code: "NOT_FOUND" }));

    await pool.removeTrack({ participantId: "alice", roomId: "room-one", trackId: track.id });
    await expect(
      pool.subscribeTrack({
        participantId: "bob",
        roomId: "room-one",
        rtpCapabilities: { codecs: [{ mimeType: "audio/opus" }] },
        trackId: track.id,
        transportId: otherRoomTransport.id,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<MediaEngineError>>({ code: "NOT_FOUND" }));
    await pool.close();
  });
});
