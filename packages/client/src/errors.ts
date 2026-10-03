export const mediaErrorCodes = [
  "MEDIA_DEVICES_UNAVAILABLE",
  "MEDIA_PERMISSION_DENIED",
  "MEDIA_DEVICE_NOT_FOUND",
  "MEDIA_CONSTRAINT_UNSATISFIED",
  "MEDIA_CAPTURE_ABORTED",
  "MEDIA_CAPTURE_FAILED",
] as const;

export type MediaErrorCode = (typeof mediaErrorCodes)[number];

export class MediaCaptureError extends Error {
  readonly code: MediaErrorCode;
  override readonly cause: unknown;

  constructor(code: MediaErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MediaCaptureError";
    this.code = code;
    this.cause = cause;
  }
}

export const normalizeMediaError = (error: unknown): MediaCaptureError => {
  if (error instanceof MediaCaptureError) return error;

  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new MediaCaptureError(
      "MEDIA_PERMISSION_DENIED",
      "Permission to use the requested media device was denied",
      error,
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MediaCaptureError(
      "MEDIA_DEVICE_NOT_FOUND",
      "The requested media device is unavailable",
      error,
    );
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return new MediaCaptureError(
      "MEDIA_CONSTRAINT_UNSATISFIED",
      "The requested media constraints cannot be satisfied",
      error,
    );
  }
  if (name === "AbortError" || name === "NotReadableError") {
    return new MediaCaptureError(
      "MEDIA_CAPTURE_ABORTED",
      "The media device could not be started",
      error,
    );
  }
  return new MediaCaptureError("MEDIA_CAPTURE_FAILED", "Media capture failed", error);
};
