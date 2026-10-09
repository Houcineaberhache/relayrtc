import type { Track } from "@relayrtc/types";
import { trackSchema } from "@relayrtc/validation";
import { z } from "zod";

import type { CorrelatedProtocolEvent } from "./envelope.js";
import { correlatedProtocolEventSchema } from "./envelope.js";

export interface TrackEventPayload {
  readonly track: Track;
}

export type TrackPublishedEvent = CorrelatedProtocolEvent<"track.published", TrackEventPayload>;
export type TrackPausedEvent = CorrelatedProtocolEvent<"track.paused", TrackEventPayload>;
export type TrackResumedEvent = CorrelatedProtocolEvent<"track.resumed", TrackEventPayload>;
export type TrackUnpublishedEvent = CorrelatedProtocolEvent<"track.unpublished", TrackEventPayload>;

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

export const trackPublishedEventSchema = correlatedProtocolEventSchema(
  "track.published",
  trackEventPayloadSchema("published"),
) satisfies z.ZodType<TrackPublishedEvent>;

export const trackPausedEventSchema = correlatedProtocolEventSchema(
  "track.paused",
  trackEventPayloadSchema("paused"),
) satisfies z.ZodType<TrackPausedEvent>;

export const trackResumedEventSchema = correlatedProtocolEventSchema(
  "track.resumed",
  trackEventPayloadSchema("resumed"),
) satisfies z.ZodType<TrackResumedEvent>;

export const trackUnpublishedEventSchema = correlatedProtocolEventSchema(
  "track.unpublished",
  trackEventPayloadSchema("unpublished"),
) satisfies z.ZodType<TrackUnpublishedEvent>;
