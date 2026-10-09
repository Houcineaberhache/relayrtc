import type { Metadata, Participant } from "@relayrtc/types";
import type { RoomLocalMedia, RoomLocalParticipant } from "./room-media.js";

export class LocalParticipantView implements RoomLocalParticipant {
  constructor(
    readonly read: () => Participant,
    readonly media: RoomLocalMedia,
    readonly updateMetadata: (metadata: Metadata) => Promise<Participant>,
  ) {}
  get id(): Participant["id"] {
    return this.read().id;
  }
  get roomId(): Participant["roomId"] {
    return this.read().roomId;
  }
  get externalId(): Participant["externalId"] {
    return this.read().externalId;
  }
  get name(): Participant["name"] {
    return this.read().name;
  }
  get metadata(): Participant["metadata"] {
    return this.read().metadata;
  }
  get role(): Participant["role"] {
    return this.read().role;
  }
  get joinedAt(): Participant["joinedAt"] {
    return this.read().joinedAt;
  }
  get leftAt(): Participant["leftAt"] {
    return this.read().leftAt;
  }
  get microphone(): RoomLocalMedia["microphone"] {
    return this.media.microphone;
  }
  get camera(): RoomLocalMedia["camera"] {
    return this.media.camera;
  }
  get screen(): RoomLocalMedia["screen"] {
    return this.media.screen;
  }
  get devices(): RoomLocalMedia["devices"] {
    return this.media.devices;
  }
  get permissions(): RoomLocalMedia["permissions"] {
    return this.media.permissions;
  }
}
