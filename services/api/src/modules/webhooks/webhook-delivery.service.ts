import { schema, type RelayKitDatabase } from "@relayrtc/database";
import { validateWebhookDestination } from "@relayrtc/protocol/webhook-security";
import { webhookSignatureContract } from "@relayrtc/protocol/webhook-signature";
import {
  webhookDeliveryAttemptSchema,
  webhookDeliveryDetailSchema,
  webhookDeliveryRecordSchema,
} from "@relayrtc/validation";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "../../http/errors/api-error.js";
import { authorizeWebhookScope, type WebhookPrincipal, type WebhookScope } from "./webhook.service.js";

type Transaction = Parameters<Parameters<RelayKitDatabase["transaction"]>[0]>[0];
type Delivery = typeof schema.webhookDelivery.$inferSelect;
const notFound = () => new ApiError(404, "RESOURCE_NOT_FOUND", "The requested webhook delivery was not found");
const deliveryFilter = (scope: WebhookScope, endpointId: string, id?: string, status?: string) => and(
  eq(schema.webhookDelivery.projectId, scope.projectId),
  eq(schema.webhookDelivery.environmentId, scope.environmentId),
  eq(schema.webhookDelivery.endpointId, endpointId),
  id === undefined ? undefined : eq(schema.webhookDelivery.id, id),
  status === undefined ? undefined : eq(schema.webhookDelivery.status, status),
);
const publicDelivery = (delivery: Delivery) => webhookDeliveryRecordSchema.parse({
  id: delivery.id,
  eventId: delivery.eventId,
  endpointId: delivery.endpointId,
  projectId: delivery.projectId,
  environmentId: delivery.environmentId,
  url: delivery.url,
  status: delivery.status,
  attemptCount: delivery.attemptCount,
  runAttemptCount: delivery.runAttemptCount,
  replayCount: delivery.replayCount,
  lastError: delivery.lastError,
  nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
  deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
  runStartedAt: delivery.runStartedAt.toISOString(),
  createdAt: delivery.createdAt.toISOString(),
  updatedAt: delivery.updatedAt.toISOString(),
});

export function createWebhookDeliveryService(database: RelayKitDatabase) {
  const run = <T>(principal: WebhookPrincipal, scope: WebhookScope, writing: boolean, operation: (transaction: Transaction) => Promise<T>) =>
    database.transaction(async (transaction) => {
      await transaction.execute(sql`set local statement_timeout = '15s'`);
      await transaction.execute(sql`set local lock_timeout = '5s'`);
      await authorizeWebhookScope(transaction, principal, scope, writing);
      return operation(transaction);
    });
  return {
    contract(principal: WebhookPrincipal, scope: WebhookScope) {
      return run(principal, scope, false, async () => webhookSignatureContract);
    },
    list(principal: WebhookPrincipal, scope: WebhookScope, endpointId: string, query: { limit: number; offset: number; status?: string | undefined }) {
      return run(principal, scope, false, async (transaction) => {
        const filter = deliveryFilter(scope, endpointId, undefined, query.status);
        const deliveries = await transaction.select().from(schema.webhookDelivery).where(filter)
          .orderBy(desc(schema.webhookDelivery.createdAt), desc(schema.webhookDelivery.id))
          .limit(query.limit).offset(query.offset);
        const [count] = await transaction.select({ total: sql<number>`count(*)::int` }).from(schema.webhookDelivery).where(filter);
        return { deliveries: deliveries.map(publicDelivery), pagination: { limit: query.limit, offset: query.offset, total: count?.total ?? 0 } };
      });
    },
    get(principal: WebhookPrincipal, scope: WebhookScope, endpointId: string, id: string) {
      return run(principal, scope, false, async (transaction) => {
        const [delivery] = await transaction.select().from(schema.webhookDelivery).where(deliveryFilter(scope, endpointId, id)).for("share");
        if (!delivery) throw notFound();
        const [event] = await transaction.select().from(schema.webhookEvent).where(and(
          eq(schema.webhookEvent.id, delivery.eventId), eq(schema.webhookEvent.projectId, scope.projectId), eq(schema.webhookEvent.environmentId, scope.environmentId),
        ));
        if (!event) throw notFound();
        const attempts = await transaction.select().from(schema.webhookDeliveryAttempt)
          .where(eq(schema.webhookDeliveryAttempt.deliveryId, id)).orderBy(asc(schema.webhookDeliveryAttempt.attemptNumber)).limit(808);
        return webhookDeliveryDetailSchema.parse({ ...publicDelivery(delivery), event: event.payload, rawBody: event.body, attempts: attempts.map((attempt) => webhookDeliveryAttemptSchema.parse({
          ...attempt, startedAt: attempt.startedAt.toISOString(), finishedAt: attempt.finishedAt?.toISOString() ?? null,
        })) });
      });
    },
    replay(principal: WebhookPrincipal, scope: WebhookScope, endpointId: string, id: string, expectedReplayCount: number) {
      return run(principal, scope, true, async (transaction) => {
        const [delivery] = await transaction.select().from(schema.webhookDelivery).where(deliveryFilter(scope, endpointId, id)).for("update");
        if (!delivery) throw notFound();
        const [endpoint] = await transaction.select().from(schema.webhookEndpoint).where(and(
          eq(schema.webhookEndpoint.id, endpointId), eq(schema.webhookEndpoint.projectId, scope.projectId), eq(schema.webhookEndpoint.environmentId, scope.environmentId),
        )).for("share");
        if (!endpoint || endpoint.deletedAt || endpoint.status !== "enabled")
          throw new ApiError(409, "WEBHOOK_REPLAY_UNAVAILABLE", "Replay requires an enabled webhook endpoint");
        if (delivery.replayCount !== expectedReplayCount || delivery.replayCount >= 100 || delivery.status === "pending" || delivery.status === "delivering")
          throw new ApiError(409, "WEBHOOK_REPLAY_CONFLICT", "Replay requires a terminal delivery and its current replay count");
        let url: string;
        try {
          url = (await validateWebhookDestination(endpoint.url)).url.toString();
        } catch {
          throw new ApiError(400, "INVALID_WEBHOOK_DESTINATION", "The webhook destination must resolve to public HTTP or HTTPS addresses");
        }
        const now = new Date();
        const [replayed] = await transaction.update(schema.webhookDelivery).set({
          url, status: "pending", replayCount: delivery.replayCount + 1, runAttemptCount: 0,
          lastError: null, deliveredAt: null, nextAttemptAt: now, runStartedAt: now, updatedAt: now,
          leaseToken: null, leasedUntil: null,
        }).where(deliveryFilter(scope, endpointId, id)).returning();
        if (!replayed) throw notFound();
        return publicDelivery(replayed);
      });
    },
  };
}
