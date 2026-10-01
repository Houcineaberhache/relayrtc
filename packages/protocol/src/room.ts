import type { Room } from "@relayrtc/types";
import { roomSchema } from "@relayrtc/validation";
import { z } from "zod";

import type { ProtocolEvent } from "./envelope.js";
import { protocolEventSchema } from "./envelope.js";

export interface RoomEndedEventPayload {
  readonly room: Room;
}

export type RoomEndedEvent = ProtocolEvent<"room.ended", RoomEndedEventPayload>;

export const roomEndedEventSchema = protocolEventSchema(
  "room.ended",
  z
    .object({
      room: roomSchema.refine((room) => room.status === "ended" && room.endedAt !== null, {
        message: "Ended room events require an ended room and endedAt timestamp",
      }),
    })
    .strict(),
) satisfies z.ZodType<RoomEndedEvent>;
