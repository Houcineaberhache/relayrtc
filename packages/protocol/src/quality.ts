import type { ConnectionQualityEvent } from "@relayrtc/types";
import { connectionQualityEventSchema } from "@relayrtc/validation";

import type { ProtocolEvent } from "./envelope.js";
import { protocolEventSchema } from "./envelope.js";
export type ConnectionQualityChangedEvent = ProtocolEvent<
  "connection.quality.changed",
  ConnectionQualityEvent
>;
export const connectionQualityChangedEventSchema = protocolEventSchema(
  "connection.quality.changed",
  connectionQualityEventSchema,
);

export type ConnectionDegradedEvent = ProtocolEvent<"connection.degraded", ConnectionQualityEvent>;
export type ConnectionRecoveredEvent = ProtocolEvent<
  "connection.recovered",
  ConnectionQualityEvent
>;

const healthy = new Set(["excellent", "good"]);

export const connectionDegradedEventSchema = protocolEventSchema(
  "connection.degraded",
  connectionQualityEventSchema.refine(
    (event) => healthy.has(event.previousQuality) && !healthy.has(event.quality),
    "A degraded event must transition from healthy to degraded quality",
  ),
);
export const connectionRecoveredEventSchema = protocolEventSchema(
  "connection.recovered",
  connectionQualityEventSchema.refine(
    (event) => !healthy.has(event.previousQuality) && healthy.has(event.quality),
    "A recovered event must transition from degraded to healthy quality",
  ),
);
