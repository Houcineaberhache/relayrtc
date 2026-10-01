import type {
  ApiKeyId,
  Brand,
  EnvironmentId,
  IsoDateTime,
  JsonValue,
  MembershipId,
  Metadata,
  OrganizationId,
  ParticipantId,
  ProjectId,
  RoomId,
  SessionId,
  TrackId,
  UsageEventId,
  UsageRecordId,
  UserId,
  WebhookDeliveryId,
  WebhookEndpointId,
  WebhookEventId,
} from "@relayrtc/types";
import { z } from "zod";

function brandedIdentifierSchema<Name extends string>() {
  return z
    .string()
    .min(1)
    .max(128)
    .regex(/^\S+$/u)
    .transform((value) => value as Brand<string, Name>);
}

export const apiKeyIdSchema = brandedIdentifierSchema<"ApiKeyId">() satisfies z.ZodType<ApiKeyId>;
export const environmentIdSchema =
  brandedIdentifierSchema<"EnvironmentId">() satisfies z.ZodType<EnvironmentId>;
export const membershipIdSchema =
  brandedIdentifierSchema<"MembershipId">() satisfies z.ZodType<MembershipId>;
export const organizationIdSchema =
  brandedIdentifierSchema<"OrganizationId">() satisfies z.ZodType<OrganizationId>;
export const participantIdSchema =
  brandedIdentifierSchema<"ParticipantId">() satisfies z.ZodType<ParticipantId>;
export const projectIdSchema =
  brandedIdentifierSchema<"ProjectId">() satisfies z.ZodType<ProjectId>;
export const roomIdSchema = brandedIdentifierSchema<"RoomId">() satisfies z.ZodType<RoomId>;
export const sessionIdSchema =
  brandedIdentifierSchema<"SessionId">() satisfies z.ZodType<SessionId>;
export const trackIdSchema = brandedIdentifierSchema<"TrackId">() satisfies z.ZodType<TrackId>;
export const usageEventIdSchema =
  brandedIdentifierSchema<"UsageEventId">() satisfies z.ZodType<UsageEventId>;
export const usageRecordIdSchema =
  brandedIdentifierSchema<"UsageRecordId">() satisfies z.ZodType<UsageRecordId>;
export const userIdSchema = brandedIdentifierSchema<"UserId">() satisfies z.ZodType<UserId>;
export const webhookDeliveryIdSchema =
  brandedIdentifierSchema<"WebhookDeliveryId">() satisfies z.ZodType<WebhookDeliveryId>;
export const webhookEndpointIdSchema =
  brandedIdentifierSchema<"WebhookEndpointId">() satisfies z.ZodType<WebhookEndpointId>;
export const webhookEventIdSchema =
  brandedIdentifierSchema<"WebhookEventId">() satisfies z.ZodType<WebhookEventId>;

export const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => value as IsoDateTime);

export const nameSchema = z.string().trim().min(1).max(120);
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const nonNegativeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const nonNegativeNumberSchema = z.number().nonnegative();

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const metadataSchema: z.ZodType<Metadata> = z.record(z.string(), jsonValueSchema);

export const timeRangeSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) >= Date.parse(value.startsAt), {
    message: "endsAt must not precede startsAt",
    path: ["endsAt"],
  });

export const pageInfoSchema = z
  .object({
    endCursor: z.string().min(1).nullable(),
    hasNextPage: z.boolean(),
  })
  .strict();

export function connectionSchema<NodeOutput>(nodeSchema: z.ZodType<NodeOutput>) {
  return z
    .object({
      nodes: z.array(nodeSchema),
      pageInfo: pageInfoSchema,
    })
    .strict();
}
