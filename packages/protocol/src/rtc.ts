import type { Metadata, RoomId, SessionId, Track, TrackId } from "@relayrtc/types";
import {
  metadataSchema,
  roomIdSchema,
  sessionIdSchema,
  trackIdSchema,
  trackSchema,
} from "@relayrtc/validation";
import { z } from "zod";

import type { CorrelatedProtocolEvent, ProtocolRequest, ProtocolResponse } from "./envelope.js";
import {
  correlatedProtocolEventSchema,
  protocolRequestSchema,
  protocolResponseSchema,
} from "./envelope.js";

const rtcIdentifierSchema = z.string().trim().min(1).max(256).regex(/^\S+$/u);
const rtcParametersSchema = z.record(z.string(), z.unknown());
const transportDirectionSchema = z.enum(["send", "receive"]);
const trackControlActionSchema = z.enum(["pause", "resume", "unpublish"]);
const rtcTrackTypeSchema = z.enum([
  "audio",
  "camera_video",
  "screen_video",
  "screen_audio",
  "data",
]);

const rtcSessionScopeSchema = z
  .object({ roomId: roomIdSchema, sessionId: sessionIdSchema })
  .strict();

const iceParametersSchema = z
  .object({
    usernameFragment: z.string().min(1).max(256),
    password: z.string().min(1).max(256),
    iceLite: z.boolean().default(true),
  })
  .strict();

const iceCandidateSchema = z
  .object({
    foundation: z.string().min(1).max(256),
    priority: z.number().int().nonnegative(),
    ip: z.string().min(1).max(256),
    protocol: z.enum(["udp", "tcp"]),
    port: z.number().int().min(1).max(65_535),
    type: z.enum(["host", "srflx", "prflx", "relay"]),
    tcpType: z.enum(["active", "passive", "so"]).optional(),
  })
  .strict();

export const dtlsParametersSchema = z
  .object({
    role: z.enum(["auto", "client", "server"]),
    fingerprints: z
      .array(
        z
          .object({
            algorithm: z.enum(["sha-1", "sha-224", "sha-256", "sha-384", "sha-512"]),
            value: z.string().min(1).max(512),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export interface RtcSessionScope {
  readonly roomId: RoomId;
  readonly sessionId: SessionId;
}

export type RtcCapabilitiesGetPayload = RtcSessionScope;
export interface RtcCapabilitiesPayload {
  readonly routerCapabilities: Readonly<Record<string, unknown>>;
}
export interface RtcTransportCreatePayload extends RtcSessionScope {
  readonly direction: "send" | "receive";
}
export interface RtcTransportCreatedPayload extends RtcSessionScope {
  readonly transportId: string;
  readonly direction: "send" | "receive";
  readonly iceParameters: Readonly<Record<string, unknown>>;
  readonly iceCandidates: readonly Readonly<Record<string, unknown>>[];
  readonly dtlsParameters: Readonly<Record<string, unknown>>;
}
export interface RtcTransportConnectPayload extends RtcSessionScope {
  readonly transportId: string;
  readonly dtlsParameters: Readonly<Record<string, unknown>>;
}
export interface RtcTransportConnectedPayload extends RtcSessionScope {
  readonly transportId: string;
}
export interface RtcIceRestartPayload extends RtcSessionScope {
  readonly transportId: string;
}
export interface RtcIceRestartedPayload extends RtcTransportConnectedPayload {
  readonly iceParameters: Readonly<Record<string, unknown>>;
}
export interface RtcTrackPublishPayload extends RtcSessionScope {
  readonly transportId: string;
  readonly trackType: Track["type"];
  readonly rtpParameters: Readonly<Record<string, unknown>>;
  readonly metadata: Metadata;
}
export interface RtcTrackPublishedPayload extends RtcSessionScope {
  readonly track: Track;
}
export interface RtcTrackControlPayload extends RtcSessionScope {
  readonly trackId: TrackId;
  readonly action: "pause" | "resume" | "unpublish";
}
export interface RtcTrackControlledPayload extends RtcSessionScope {
  readonly track: Track;
}
export interface RtcTrackSubscribePayload extends RtcSessionScope {
  readonly transportId: string;
  readonly trackId: TrackId;
  readonly rtpCapabilities: Readonly<Record<string, unknown>>;
}
export interface RtcTrackSubscribedPayload extends RtcSessionScope {
  readonly subscriptionId: string;
  readonly trackId: TrackId;
  readonly rtpParameters: Readonly<Record<string, unknown>>;
  readonly trackType: Track["type"];
}

export type RtcCapabilitiesGetRequest = ProtocolRequest<
  "rtc.capabilities.get",
  RtcCapabilitiesGetPayload
>;
export type RtcCapabilitiesResponse = ProtocolResponse<"rtc.capabilities", RtcCapabilitiesPayload>;
export type RtcTransportCreateRequest = ProtocolRequest<
  "rtc.transport.create",
  RtcTransportCreatePayload
>;
export type RtcTransportCreatedResponse = ProtocolResponse<
  "rtc.transport.created",
  RtcTransportCreatedPayload
>;
export type RtcTransportConnectRequest = ProtocolRequest<
  "rtc.transport.connect",
  RtcTransportConnectPayload
>;
export type RtcTransportConnectedResponse = ProtocolResponse<
  "rtc.transport.connected",
  RtcTransportConnectedPayload
>;
export type RtcIceRestartRequest = ProtocolRequest<"rtc.ice.restart", RtcIceRestartPayload>;
export type RtcIceRestartedResponse = ProtocolResponse<"rtc.ice.restarted", RtcIceRestartedPayload>;
export type RtcTrackPublishRequest = ProtocolRequest<"rtc.track.publish", RtcTrackPublishPayload>;
export type RtcTrackPublishedResponse = ProtocolResponse<
  "rtc.track.publish.accepted",
  RtcTrackPublishedPayload
>;
export type RtcTrackControlRequest = ProtocolRequest<"rtc.track.control", RtcTrackControlPayload>;
export type RtcTrackControlledResponse = ProtocolResponse<
  "rtc.track.control.accepted",
  RtcTrackControlledPayload
>;
export type RtcTrackSubscribeRequest = ProtocolRequest<
  "rtc.track.subscribe",
  RtcTrackSubscribePayload
>;
export type RtcTrackSubscribedResponse = ProtocolResponse<
  "rtc.track.subscribe.accepted",
  RtcTrackSubscribedPayload
>;

export const rtcCapabilitiesGetRequestSchema = protocolRequestSchema(
  "rtc.capabilities.get",
  rtcSessionScopeSchema,
);
export const rtcCapabilitiesResponseSchema = protocolResponseSchema(
  "rtc.capabilities",
  z.object({ routerCapabilities: rtcParametersSchema }).strict(),
);
export const rtcTransportCreateRequestSchema = protocolRequestSchema(
  "rtc.transport.create",
  rtcSessionScopeSchema.extend({ direction: transportDirectionSchema }).strict(),
);
export const rtcTransportCreatedResponseSchema = protocolResponseSchema(
  "rtc.transport.created",
  rtcSessionScopeSchema
    .extend({
      transportId: rtcIdentifierSchema,
      direction: transportDirectionSchema,
      iceParameters: iceParametersSchema,
      iceCandidates: z.array(iceCandidateSchema).min(1).readonly(),
      dtlsParameters: dtlsParametersSchema,
    })
    .strict(),
);
export const rtcTransportConnectRequestSchema = protocolRequestSchema(
  "rtc.transport.connect",
  rtcSessionScopeSchema
    .extend({ transportId: rtcIdentifierSchema, dtlsParameters: dtlsParametersSchema })
    .strict(),
);
export const rtcTransportConnectedResponseSchema = protocolResponseSchema(
  "rtc.transport.connected",
  rtcSessionScopeSchema.extend({ transportId: rtcIdentifierSchema }).strict(),
);
export const rtcIceRestartRequestSchema = protocolRequestSchema(
  "rtc.ice.restart",
  rtcSessionScopeSchema.extend({ transportId: rtcIdentifierSchema }).strict(),
);
export const rtcIceRestartedResponseSchema = protocolResponseSchema(
  "rtc.ice.restarted",
  rtcSessionScopeSchema
    .extend({ transportId: rtcIdentifierSchema, iceParameters: iceParametersSchema })
    .strict(),
);
export const rtcTrackPublishRequestSchema = protocolRequestSchema(
  "rtc.track.publish",
  rtcSessionScopeSchema
    .extend({
      transportId: rtcIdentifierSchema,
      trackType: rtcTrackTypeSchema,
      rtpParameters: rtcParametersSchema,
      metadata: metadataSchema.default({}),
    })
    .strict(),
);
export const rtcTrackPublishedResponseSchema = protocolResponseSchema(
  "rtc.track.publish.accepted",
  rtcSessionScopeSchema.extend({ track: trackSchema }).strict(),
);
export const rtcTrackControlRequestSchema = protocolRequestSchema(
  "rtc.track.control",
  rtcSessionScopeSchema
    .extend({ trackId: trackIdSchema, action: trackControlActionSchema })
    .strict(),
);
export const rtcTrackControlledResponseSchema = protocolResponseSchema(
  "rtc.track.control.accepted",
  rtcSessionScopeSchema.extend({ track: trackSchema }).strict(),
);
export const rtcTrackSubscribeRequestSchema = protocolRequestSchema(
  "rtc.track.subscribe",
  rtcSessionScopeSchema
    .extend({
      transportId: rtcIdentifierSchema,
      trackId: trackIdSchema,
      rtpCapabilities: rtcParametersSchema,
    })
    .strict(),
);
export const rtcTrackSubscribedResponseSchema = protocolResponseSchema(
  "rtc.track.subscribe.accepted",
  rtcSessionScopeSchema
    .extend({
      subscriptionId: rtcIdentifierSchema,
      trackId: trackIdSchema,
      rtpParameters: rtcParametersSchema,
      trackType: rtcTrackTypeSchema,
    })
    .strict(),
);

export interface RtcSubscriptionResumePayload extends RtcSessionScope {
  readonly subscriptionId: string;
}
export type RtcSubscriptionResumeRequest = ProtocolRequest<
  "rtc.subscription.resume",
  RtcSubscriptionResumePayload
>;
export type RtcSubscriptionResumedResponse = ProtocolResponse<
  "rtc.subscription.resumed",
  RtcSubscriptionResumePayload
>;
export const rtcSubscriptionResumeRequestSchema = protocolRequestSchema(
  "rtc.subscription.resume",
  rtcSessionScopeSchema.extend({ subscriptionId: rtcIdentifierSchema }).strict(),
);
export const rtcSubscriptionResumedResponseSchema = protocolResponseSchema(
  "rtc.subscription.resumed",
  rtcSessionScopeSchema.extend({ subscriptionId: rtcIdentifierSchema }).strict(),
);

export type RtcSubscriptionCloseRequest = ProtocolRequest<
  "rtc.subscription.close",
  RtcSubscriptionResumePayload
>;
export type RtcSubscriptionCloseAcceptedResponse = ProtocolResponse<
  "rtc.subscription.close.accepted",
  RtcSubscriptionResumePayload
>;
export const rtcSubscriptionCloseRequestSchema = protocolRequestSchema(
  "rtc.subscription.close",
  rtcSessionScopeSchema.extend({ subscriptionId: rtcIdentifierSchema }).strict(),
);
export const rtcSubscriptionCloseAcceptedResponseSchema = protocolResponseSchema(
  "rtc.subscription.close.accepted",
  rtcSessionScopeSchema.extend({ subscriptionId: rtcIdentifierSchema }).strict(),
);

const subscriptionClosedPayloadSchema = rtcSessionScopeSchema
  .extend({
    subscriptionId: rtcIdentifierSchema,
    trackId: trackIdSchema.nullable(),
    reason: z.enum([
      "cancelled",
      "track_unpublished",
      "owner_left",
      "negotiation_timeout",
      "runtime_reset",
    ]),
  })
  .strict();
export type RtcSubscriptionClosedEvent = CorrelatedProtocolEvent<
  "rtc.subscription.closed",
  z.infer<typeof subscriptionClosedPayloadSchema>
>;
export const rtcSubscriptionClosedEventSchema = correlatedProtocolEventSchema(
  "rtc.subscription.closed",
  subscriptionClosedPayloadSchema,
);
