import { z } from "zod";

import type { ProtocolErrorMessage } from "./error.js";
import { protocolErrorMessageSchema } from "./error.js";
import type { HeartbeatPingRequest, HeartbeatPongResponse } from "./heartbeat.js";
import { heartbeatPingRequestSchema, heartbeatPongResponseSchema } from "./heartbeat.js";
import type {
  ParticipantJoinAcceptedResponse,
  ParticipantJoinedEvent,
  ParticipantJoinRequest,
  ParticipantLeaveAcceptedResponse,
  ParticipantLeftEvent,
  ParticipantLeaveRequest,
  ParticipantReconnectedEvent,
} from "./participant.js";
import {
  participantJoinAcceptedResponseSchema,
  participantJoinedEventSchema,
  participantJoinRequestSchema,
  participantLeaveAcceptedResponseSchema,
  participantLeftEventSchema,
  participantLeaveRequestSchema,
  participantReconnectedEventSchema,
} from "./participant.js";
import type { RoomEndedEvent } from "./room.js";
import { roomEndedEventSchema } from "./room.js";
import type {
  RtcCapabilitiesGetRequest,
  RtcCapabilitiesResponse,
  RtcIceRestartedResponse,
  RtcIceRestartRequest,
  RtcTrackControlledResponse,
  RtcTrackControlRequest,
  RtcTrackPublishedResponse,
  RtcTrackPublishRequest,
  RtcTrackSubscribedResponse,
  RtcTrackSubscribeRequest,
  RtcTransportConnectedResponse,
  RtcTransportConnectRequest,
  RtcTransportCreatedResponse,
  RtcTransportCreateRequest,
} from "./rtc.js";
import {
  rtcCapabilitiesGetRequestSchema,
  rtcCapabilitiesResponseSchema,
  rtcIceRestartedResponseSchema,
  rtcIceRestartRequestSchema,
  rtcTrackControlledResponseSchema,
  rtcTrackControlRequestSchema,
  rtcTrackPublishedResponseSchema,
  rtcTrackPublishRequestSchema,
  rtcTrackSubscribedResponseSchema,
  rtcTrackSubscribeRequestSchema,
  rtcTransportConnectedResponseSchema,
  rtcTransportConnectRequestSchema,
  rtcTransportCreatedResponseSchema,
  rtcTransportCreateRequestSchema,
} from "./rtc.js";
import type { SessionResumeAcceptedResponse, SessionResumeRequest } from "./session.js";
import { sessionResumeAcceptedResponseSchema, sessionResumeRequestSchema } from "./session.js";
import type {
  TrackPausedEvent,
  TrackPublishedEvent,
  TrackResumedEvent,
  TrackUnpublishedEvent,
} from "./track.js";
import {
  trackPausedEventSchema,
  trackPublishedEventSchema,
  trackResumedEventSchema,
  trackUnpublishedEventSchema,
} from "./track.js";

export const protocolRequestTypes = [
  "heartbeat.ping",
  "participant.join",
  "participant.leave",
  "rtc.capabilities.get",
  "rtc.transport.create",
  "rtc.transport.connect",
  "rtc.ice.restart",
  "rtc.track.publish",
  "rtc.track.control",
  "rtc.track.subscribe",
  "session.resume",
] as const;

export const protocolResponseTypes = [
  "heartbeat.pong",
  "participant.join.accepted",
  "participant.leave.accepted",
  "rtc.capabilities",
  "rtc.transport.created",
  "rtc.transport.connected",
  "rtc.ice.restarted",
  "rtc.track.publish.accepted",
  "rtc.track.control.accepted",
  "rtc.track.subscribe.accepted",
  "session.resume.accepted",
] as const;

export const protocolEventTypes = [
  "room.ended",
  "participant.joined",
  "participant.left",
  "participant.reconnected",
  "track.published",
  "track.paused",
  "track.resumed",
  "track.unpublished",
] as const;

export type ProtocolRequestMessage =
  | HeartbeatPingRequest
  | ParticipantJoinRequest
  | ParticipantLeaveRequest
  | RtcCapabilitiesGetRequest
  | RtcTransportCreateRequest
  | RtcTransportConnectRequest
  | RtcIceRestartRequest
  | RtcTrackPublishRequest
  | RtcTrackControlRequest
  | RtcTrackSubscribeRequest
  | SessionResumeRequest;

export type ProtocolResponseMessage =
  | HeartbeatPongResponse
  | ParticipantJoinAcceptedResponse
  | ParticipantLeaveAcceptedResponse
  | RtcCapabilitiesResponse
  | RtcTransportCreatedResponse
  | RtcTransportConnectedResponse
  | RtcIceRestartedResponse
  | RtcTrackPublishedResponse
  | RtcTrackControlledResponse
  | RtcTrackSubscribedResponse
  | SessionResumeAcceptedResponse;

export type ProtocolEventMessage =
  | RoomEndedEvent
  | ParticipantJoinedEvent
  | ParticipantLeftEvent
  | ParticipantReconnectedEvent
  | TrackPublishedEvent
  | TrackPausedEvent
  | TrackResumedEvent
  | TrackUnpublishedEvent;

export type ClientProtocolMessage = ProtocolRequestMessage;
export type ServerProtocolMessage =
  ProtocolResponseMessage | ProtocolEventMessage | ProtocolErrorMessage;
export type ProtocolMessage = ClientProtocolMessage | ServerProtocolMessage;
export type ProtocolMessageType = ProtocolMessage["type"];
export type ProtocolMessageOfType<Type extends ProtocolMessageType> = Extract<
  ProtocolMessage,
  { readonly type: Type }
>;

export const protocolMessageTypes = [
  ...protocolRequestTypes,
  ...protocolResponseTypes,
  ...protocolEventTypes,
  "protocol.error",
] as const satisfies readonly ProtocolMessageType[];

export const protocolMessageSchema: z.ZodType<ProtocolMessage> = z.discriminatedUnion("type", [
  heartbeatPingRequestSchema,
  heartbeatPongResponseSchema,
  participantJoinRequestSchema,
  participantJoinAcceptedResponseSchema,
  participantLeaveRequestSchema,
  participantLeaveAcceptedResponseSchema,
  rtcCapabilitiesGetRequestSchema,
  rtcCapabilitiesResponseSchema,
  rtcTransportCreateRequestSchema,
  rtcTransportCreatedResponseSchema,
  rtcTransportConnectRequestSchema,
  rtcTransportConnectedResponseSchema,
  rtcIceRestartRequestSchema,
  rtcIceRestartedResponseSchema,
  rtcTrackPublishRequestSchema,
  rtcTrackPublishedResponseSchema,
  rtcTrackControlRequestSchema,
  rtcTrackControlledResponseSchema,
  rtcTrackSubscribeRequestSchema,
  rtcTrackSubscribedResponseSchema,
  sessionResumeRequestSchema,
  sessionResumeAcceptedResponseSchema,
  roomEndedEventSchema,
  participantJoinedEventSchema,
  participantLeftEventSchema,
  participantReconnectedEventSchema,
  trackPublishedEventSchema,
  trackPausedEventSchema,
  trackResumedEventSchema,
  trackUnpublishedEventSchema,
  protocolErrorMessageSchema,
]);

export function parseProtocolMessage(input: unknown): ProtocolMessage {
  return protocolMessageSchema.parse(input);
}

export function safeParseProtocolMessage(input: unknown) {
  return protocolMessageSchema.safeParse(input);
}

export function serializeProtocolMessage(message: ProtocolMessage): string {
  return JSON.stringify(message);
}

export function deserializeProtocolMessage(serialized: string): ProtocolMessage {
  const input: unknown = JSON.parse(serialized);
  return parseProtocolMessage(input);
}
