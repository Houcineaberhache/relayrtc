import type { MediaErrorCode } from "./errors.js";

export type RoomErrorCode =
  | MediaErrorCode
  | "MEDIA_OPERATION_PENDING"
  | "MEDIA_OPERATION_CANCELLED"
  | "MEDIA_NOT_ENABLED"
  | "MEDIA_PUBLISH_FAILED"
  | "MEDIA_SUBSCRIBE_FAILED"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_CONFIGURATION"
  | "INVALID_TOKEN"
  | "ALREADY_JOINED"
  | "JOIN_CANCELLED"
  | "NOT_CONNECTED"
  | "CONNECTION_FAILED"
  | "CONNECTION_CLOSED"
  | "REQUEST_TIMEOUT"
  | "PROTOCOL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "SESSION_CONFLICT"
  | "RATE_LIMITED"
  | "AUTHENTICATION_FAILED"
  | "TOKEN_EXPIRED"
  | "ROOM_ENDED"
  | "RTC_STATE_CHANGED"
  | "POLICY_VIOLATION"
  | "PARTICIPANT_REMOVED"
  | "RTC_SETUP_FAILED";

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message: string,
    readonly retryable = false,
    readonly serverCode?: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}
