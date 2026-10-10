import type { ConnectionQuality, ConnectionQualityEvent } from "@relayrtc/types";
import { randomUUID } from "node:crypto";

export type QualityEventType =
  "connection.degraded" | "connection.recovered" | "connection.quality.changed";
export interface QualityTransition {
  type: QualityEventType;
  event: ConnectionQualityEvent;
}

export interface QualityEventPublisher {
  publish(type: QualityEventType, event: ConnectionQualityEvent): Promise<void>;
}

export interface HttpQualityEventPublisherOptions {
  internalSecret: string;
  signalingUrl: string;
}

export const createHttpQualityEventPublisher = (
  options: HttpQualityEventPublisherOptions,
): QualityEventPublisher => ({
  async publish(type, event) {
    const response = await fetch(
      `${options.signalingUrl}/rooms/${encodeURIComponent(event.roomId)}/quality-events`,
      {
        body: JSON.stringify({ ...event, type }),
        headers: {
          authorization: `Bearer ${options.internalSecret}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(`Signaling quality event returned HTTP ${String(response.status)}`);
  },
});

export const qualityEvent = (
  roomId: string,
  participantId: string,
  previousQuality: ConnectionQuality,
  quality: ConnectionQuality,
): ConnectionQualityEvent => ({
  eventId: randomUUID(),
  source: "media",
  occurredAt: new Date().toISOString() as ConnectionQualityEvent["occurredAt"],
  participantId: participantId as ConnectionQualityEvent["participantId"],
  previousQuality,
  quality,
  roomId: roomId as ConnectionQualityEvent["roomId"],
});
