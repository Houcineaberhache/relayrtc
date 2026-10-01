import type { Track } from "@relaykit/types";
import { trackSchema } from "@relaykit/validation";
import { z } from "zod";

import type { ProtocolEvent } from "./envelope.js";
import { protocolEventSchema } from "./envelope.js";

export interface TrackEventPayload {
  readonly track: Track;
}

export type TrackPublishedEvent = ProtocolEvent<"track.published", TrackEventPayload>;
export type TrackPausedEvent = ProtocolEvent<"track.paused", TrackEventPayload>;
export type TrackResumedEvent = ProtocolEvent<"track.resumed", TrackEventPayload>;
export type TrackUnpublishedEvent = ProtocolEvent<"track.unpublished", TrackEventPayload>;

function trackEventPayloadSchema(state: Track["state"]) {
  return z
    .object({
      track: trackSchema
        .refine((track) => track.state === state, {
          message: `Track state must be ${state}`,
          path: ["state"],
        })
        .refine((track) => state !== "unpublished" || track.unpublishedAt !== null, {
          message: "Unpublished track events require an unpublishedAt timestamp",
          path: ["unpublishedAt"],
        }),
    })
    .strict();
}

export const trackPublishedEventSchema = protocolEventSchema(
  "track.published",
  trackEventPayloadSchema("published"),
) satisfies z.ZodType<TrackPublishedEvent>;

export const trackPausedEventSchema = protocolEventSchema(
  "track.paused",
  trackEventPayloadSchema("paused"),
) satisfies z.ZodType<TrackPausedEvent>;

export const trackResumedEventSchema = protocolEventSchema(
  "track.resumed",
  trackEventPayloadSchema("resumed"),
) satisfies z.ZodType<TrackResumedEvent>;

export const trackUnpublishedEventSchema = protocolEventSchema(
  "track.unpublished",
  trackEventPayloadSchema("unpublished"),
) satisfies z.ZodType<TrackUnpublishedEvent>;
