export const rtcErrorCodes = [
  "RTC_UNAVAILABLE",
  "RTC_CONNECTION_CLOSED",
  "RTC_INVALID_DESCRIPTION",
  "RTC_NEGOTIATION_FAILED",
  "RTC_ICE_CANDIDATE_FAILED",
  "RTC_ICE_GATHERING_TIMEOUT",
  "RTC_ICE_RESTART_FAILED",
] as const;

export type RtcErrorCode = (typeof rtcErrorCodes)[number];

export class RtcConnectionError extends Error {
  readonly code: RtcErrorCode;
  override readonly cause: unknown;

  constructor(code: RtcErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RtcConnectionError";
    this.code = code;
    this.cause = cause;
  }
}

export const normalizeRtcError = (error: unknown): RtcConnectionError => {
  if (error instanceof RtcConnectionError) return error;
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return new RtcConnectionError("RTC_CONNECTION_CLOSED", "The RTC connection is closed", error);
  }
  if (error instanceof DOMException && error.name === "OperationError") {
    return new RtcConnectionError(
      "RTC_INVALID_DESCRIPTION",
      "The RTC session description is invalid",
      error,
    );
  }
  return new RtcConnectionError("RTC_NEGOTIATION_FAILED", "RTC negotiation failed", error);
};
