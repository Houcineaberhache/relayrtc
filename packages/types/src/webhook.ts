import type {
  EnvironmentId,
  IsoDateTime,
  JsonObject,
  ProjectId,
  WebhookDeliveryId,
  WebhookEndpointId,
  WebhookEventId,
} from "./common.js";

export const webhookEventTypes = [
  "room.created",
  "room.started",
  "room.ended",
  "participant.joined",
  "participant.left",
  "participant.reconnected",
  "track.published",
  "track.unpublished",
  "connection.degraded",
  "connection.recovered",
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

export const webhookEndpointStatuses = ["enabled", "disabled"] as const;

export type WebhookEndpointStatus = (typeof webhookEndpointStatuses)[number];

export const webhookDeliveryStatuses = [
  "pending",
  "delivering",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type WebhookDeliveryStatus = (typeof webhookDeliveryStatuses)[number];

export interface WebhookEndpoint {
  readonly id: WebhookEndpointId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly url: string;
  readonly eventTypes: readonly WebhookEventType[];
  readonly status: WebhookEndpointStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StoredWebhookEndpoint extends WebhookEndpoint {
  readonly hashedSigningSecret: string;
}

export interface WebhookEvent {
  readonly id: WebhookEventId;
  readonly type: WebhookEventType;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly occurredAt: IsoDateTime;
  readonly data: JsonObject;
}

export interface WebhookDelivery {
  readonly id: WebhookDeliveryId;
  readonly endpointId: WebhookEndpointId;
  readonly event: WebhookEvent;
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: IsoDateTime | null;
  readonly deliveredAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
}
