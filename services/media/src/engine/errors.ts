export class MediaEngineError extends Error {
  constructor(
    readonly code: "CAPACITY_EXCEEDED" | "NOT_FOUND" | "NOT_READY" | "UNSUPPORTED_OPERATION",
    message: string,
  ) {
    super(message);
    this.name = "MediaEngineError";
  }
}
