import type { Participant, Track } from "@relayrtc/types";
import type { ServerProtocolMessage, ParticipantJoinAcceptedPayload } from "@relayrtc/protocol";
import { RoomError } from "./room-errors.js";
import type { RoomEventEmitter } from "./room-events.js";
import type { RoomRemoteParticipant, RoomRemoteTrack } from "./room-remote.js";
import { RemoteTrack } from "./room-remote-track.js";
import type { RoomRtc } from "./room-rtc.js";

function readonlyMap<Value>(source: Map<string, Value>): ReadonlyMap<string, Value> {
  const view: ReadonlyMap<string, Value> = {
    get size() {
      return source.size;
    },
    get: (key) => source.get(key),
    has: (key) => source.has(key),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    [Symbol.iterator]: () => source[Symbol.iterator](),
    forEach: (callback, thisArg?: unknown) => {
      source.forEach((value, key) => {
        callback.call(thisArg, value, key, view);
      });
    },
  };
  return Object.freeze(view);
}

class RemoteParticipant implements RoomRemoteParticipant {
  readonly sources = new Map<string, RoomRemoteTrack>();
  readonly tracks = readonlyMap(this.sources);
  constructor(public info: Participant) {}
  get id(): Participant["id"] {
    return this.info.id;
  }
  get roomId(): Participant["roomId"] {
    return this.info.roomId;
  }
  get externalId(): Participant["externalId"] {
    return this.info.externalId;
  }
  get name(): Participant["name"] {
    return this.info.name;
  }
  get metadata(): Participant["metadata"] {
    return this.info.metadata;
  }
  get role(): Participant["role"] {
    return this.info.role;
  }
  get joinedAt(): Participant["joinedAt"] {
    return this.info.joinedAt;
  }
  get leftAt(): Participant["leftAt"] {
    return this.info.leftAt;
  }
}

export class RemoteRoomRegistry {
  readonly #participants = new Map<string, RemoteParticipant>();
  readonly #tracks = new Map<string, RemoteTrack>();
  readonly participants: ReadonlyMap<string, RoomRemoteParticipant> = readonlyMap(
    this.#participants,
  );
  readonly tracks: ReadonlyMap<string, RoomRemoteTrack> = readonlyMap(this.#tracks);
  readonly #removed = new Set<string>();
  readonly #departed = new Set<string>();
  readonly #events = new Set<string>();
  readonly #latest = new Map<string, string>();
  readonly #reconnections = new Map<string, string>();
  #scope: { roomId: string; participantId: string; sessionId: string } | undefined;
  #ready = false;
  #closed = false;

  constructor(
    readonly rtc: RoomRtc,
    readonly events: Pick<RoomEventEmitter, "emit">,
    readonly assertActive: () => void,
    readonly autoSubscribe: boolean,
  ) {}

  reconcile(
    snapshot: Pick<ParticipantJoinAcceptedPayload, "participants" | "tracks">,
    scope: { roomId: string; participantId: string; sessionId: string },
  ): void {
    if (this.#closed) return;
    this.#scope = scope;
    for (const info of snapshot.participants)
      if (info.roomId !== scope.roomId)
        throw new RoomError("PROTOCOL_ERROR", "A participant belongs to another room");
    for (const info of snapshot.tracks)
      if (info.roomId !== scope.roomId)
        throw new RoomError("PROTOCOL_ERROR", "A track belongs to another room");
    const participantIds = new Set<string>(
      snapshot.participants.filter((info) => info.leftAt === null).map((info) => info.id),
    );
    const trackIds = new Set<string>(
      snapshot.tracks.filter((info) => info.state !== "unpublished").map((info) => info.id),
    );
    for (const id of this.#tracks.keys()) if (!trackIds.has(id)) this.#removeTrack(id);
    for (const [id, participant] of this.#participants)
      if (!participantIds.has(id)) this.#removeParticipant(participant);
    this.#removed.clear();
    this.#departed.clear();
    for (const participant of snapshot.participants) this.#upsertParticipant(participant);
    for (const track of snapshot.tracks) this.#upsertTrack(track);
  }

  ready(): void {
    if (this.#closed) return;
    this.#ready = true;
    for (const track of this.#tracks.values()) this.#subscribe(track);
  }

  handle(message: ServerProtocolMessage): void {
    const scope = this.#scope;
    if (!scope || this.#closed || this.#events.has(message.id)) return;
    let entity: string | undefined;
    switch (message.type) {
      case "participant.joined":
      case "participant.metadata.updated":
        entity = `participant:${message.payload.participant.id}`;
        break;
      case "participant.left":
        entity = `participant:${message.payload.participantId}`;
        break;
      case "track.published":
      case "track.paused":
      case "track.resumed":
      case "track.unpublished":
        entity = `track:${message.payload.track.id}`;
        break;
    }
    const latest = entity ? this.#latest.get(entity) : undefined;
    if (latest && message.sentAt < latest) return;
    switch (message.type) {
      case "participant.joined":
      case "participant.metadata.updated": {
        const info = message.payload.participant;
        if (info.roomId !== scope.roomId) return;
        this.#upsertParticipant(info);
        break;
      }
      case "participant.left": {
        const info = message.payload;
        if (info.roomId !== scope.roomId || info.participantId === scope.participantId) return;
        this.#remember(this.#departed, info.sessionId);
        for (const [id, track] of this.#tracks)
          if (track.info.sessionId === info.sessionId) this.#removeTrack(id);
        const participant = this.#participants.get(info.participantId);
        if (participant) {
          const hasNewSession = [...participant.sources.values()].some(
            (track) => track.info.sessionId !== info.sessionId,
          );
          if (!hasNewSession) {
            participant.info = { ...participant.info, leftAt: info.leftAt };
            this.#removeParticipant(participant);
          }
        }
        break;
      }
      case "participant.reconnected": {
        const participant = this.#participants.get(message.payload.participantId);
        if (message.payload.session.participantId === participant?.id) {
          const reconnect = `${message.payload.session.id}:${message.payload.session.reconnectedAt ?? ""}`;
          if (this.#reconnections.get(participant.id) === reconnect) return;
          this.#reconnections.set(participant.id, reconnect);
          this.#departed.delete(message.payload.session.id);
          this.events.emit("participantReconnected", {
            participant,
            session: message.payload.session,
          });
        }
        break;
      }
      case "track.published":
      case "track.paused":
      case "track.resumed":
      case "track.unpublished": {
        if (message.payload.track.roomId !== scope.roomId) return;
        this.#upsertTrack(message.payload.track);
        break;
      }
      case "rtc.subscription.closed": {
        if (
          message.payload.roomId !== scope.roomId ||
          message.payload.sessionId !== scope.sessionId
        )
          return;
        this.rtc.subscriptionClosed(message.payload.subscriptionId, message.payload.reason);
        break;
      }
      default:
        return;
    }
    if (entity) {
      this.#latest.delete(entity);
      this.#latest.set(entity, message.sentAt);
      if (this.#latest.size > 4096) {
        const oldest = this.#latest.keys().next().value;
        if (oldest) this.#latest.delete(oldest);
      }
    }
    this.#remember(this.#events, message.id);
  }

  #upsertParticipant(info: Participant): void {
    if (this.#closed || info.id === this.#scope?.participantId || info.leftAt !== null) return;
    let participant = this.#participants.get(info.id);
    if (participant) {
      if (JSON.stringify(participant.info) !== JSON.stringify(info)) {
        participant.info = info;
        this.events.emit("participantUpdated", participant);
      }
      return;
    }
    participant = new RemoteParticipant(info);
    this.#participants.set(info.id, participant);
    for (const track of this.#tracks.values())
      if (track.participantId === info.id) participant.sources.set(track.id, track);
    this.events.emit("participantJoined", participant);
    for (const track of participant.sources.values()) this.#subscribe(track);
  }

  #upsertTrack(info: Track): void {
    if (this.#closed || info.participantId === this.#scope?.participantId) return;
    if (info.state === "unpublished") {
      this.#tracks.get(info.id)?.update(info);
      this.#removeTrack(info.id);
      this.#remember(this.#removed, info.id);
      return;
    }
    if (this.#removed.has(info.id) || this.#departed.has(info.sessionId)) return;
    const existing = this.#tracks.get(info.id);
    if (existing) {
      if (
        existing.participantId !== info.participantId ||
        existing.info.sessionId !== info.sessionId ||
        existing.type !== info.type
      )
        throw new RoomError("PROTOCOL_ERROR", "The remote track identity changed");
      if (JSON.stringify(existing.info) !== JSON.stringify(info)) {
        existing.update(info);
        this.events.emit("trackUpdated", existing);
      }
      return;
    }
    const track = new RemoteTrack(info, this.rtc, this.events, this.assertActive);
    this.#tracks.set(info.id, track);
    this.#participants.get(info.participantId)?.sources.set(info.id, track);
    this.events.emit("trackPublished", track);
    this.#subscribe(track);
  }

  #subscribe(track: RoomRemoteTrack): void {
    if (
      !this.#closed &&
      this.#ready &&
      this.autoSubscribe &&
      track.type !== "data" &&
      this.#participants.has(track.participantId)
    )
      void track.subscribe().catch(() => undefined);
  }

  #removeTrack(id: string): void {
    const track = this.#tracks.get(id);
    if (!track) return;
    this.#tracks.delete(id);
    this.#participants.get(track.participantId)?.sources.delete(id);
    this.#remember(this.#removed, id);
    track.dispose();
    this.events.emit("trackUnpublished", track);
  }

  #removeParticipant(participant: RemoteParticipant): void {
    for (const id of participant.sources.keys()) this.#removeTrack(id);
    this.#participants.delete(participant.id);
    this.#reconnections.delete(participant.id);
    this.events.emit("participantLeft", participant);
  }

  #remember(set: Set<string>, id: string): void {
    set.add(id);
    if (set.size > 4096) {
      const oldest = set.values().next().value;
      if (oldest) set.delete(oldest);
    }
  }

  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const id of this.#tracks.keys()) this.#removeTrack(id);
    for (const participant of this.#participants.values()) this.#removeParticipant(participant);
    this.#events.clear();
    this.#latest.clear();
    this.#reconnections.clear();
    this.#removed.clear();
    this.#departed.clear();
  }
}
