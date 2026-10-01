declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type ApiKeyId = Brand<string, "ApiKeyId">;
export type EnvironmentId = Brand<string, "EnvironmentId">;
export type IsoDateTime = Brand<string, "IsoDateTime">;
export type MembershipId = Brand<string, "MembershipId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type ProjectId = Brand<string, "ProjectId">;
export type RoomId = Brand<string, "RoomId">;
export type SessionId = Brand<string, "SessionId">;
export type TrackId = Brand<string, "TrackId">;
export type UsageEventId = Brand<string, "UsageEventId">;
export type UsageRecordId = Brand<string, "UsageRecordId">;
export type UserId = Brand<string, "UserId">;
export type WebhookDeliveryId = Brand<string, "WebhookDeliveryId">;
export type WebhookEndpointId = Brand<string, "WebhookEndpointId">;
export type WebhookEventId = Brand<string, "WebhookEventId">;

export type JsonPrimitive = boolean | number | string | null;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export type Metadata = Readonly<Record<string, JsonValue>>;

export interface TimeRange {
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
}

export interface PageInfo {
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

export interface Connection<Node> {
  readonly nodes: readonly Node[];
  readonly pageInfo: PageInfo;
}
