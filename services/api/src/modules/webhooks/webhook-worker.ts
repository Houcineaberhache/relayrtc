import { randomUUID } from "node:crypto";
import { schema, type RelayKitDatabase } from "@relayrtc/database";
import {
  createWebhookSecretVault,
  postWebhookRequest,
  WebhookDestinationError,
  webhookSecretContext,
} from "@relayrtc/protocol/webhook-security";
import { signWebhookRequest } from "@relayrtc/protocol/webhook-signature";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

type Transaction = Parameters<Parameters<RelayKitDatabase["transaction"]>[0]>[0];
const backoff = [5_000, 30_000, 120_000, 600_000, 1_800_000, 3_600_000, 21_600_000] as const;
const run = <T>(database: RelayKitDatabase, operation: (transaction: Transaction) => Promise<T>) => database.transaction(async (transaction) => {
  await transaction.execute(sql`set local statement_timeout = '15s'`);
  await transaction.execute(sql`set local lock_timeout = '5s'`);
  return operation(transaction);
});

async function maintainDeliveries(database: RelayKitDatabase, retain: boolean) {
  await run(database, async (transaction) => {
    const expired = await transaction.execute(sql`
      select id, attempt_count from webhook_delivery where status = 'delivering' and leased_until <= now()
      order by leased_until limit 100 for update skip locked
    `);
    for (const delivery of expired) {
      await transaction.execute(sql`
        update webhook_delivery_attempt set status = 'abandoned', error_code = 'lease_expired', finished_at = now()
        where delivery_id = ${String(delivery.id)} and attempt_number = ${Number(delivery.attempt_count)} and status = 'started'
      `);
      await transaction.execute(sql`
        update webhook_delivery set status = case when run_attempt_count >= 8 or run_started_at <= now() - interval '7 days' then 'failed' else 'pending' end,
          next_attempt_at = case when run_attempt_count >= 8 or run_started_at <= now() - interval '7 days' then null else now() + interval '30 seconds' end,
          lease_token = null, leased_until = null, last_error = 'lease_expired', updated_at = now()
        where id = ${String(delivery.id)}
      `);
    }
    await transaction.execute(sql`
      with stale as (
        select d.id,
          case when d.run_attempt_count >= 8 then 'attempt_limit' when d.run_started_at <= now() - interval '7 days' then 'run_expired' else 'endpoint_unavailable' end as reason
        from webhook_delivery d
        where d.status = 'pending' and (d.run_attempt_count >= 8 or d.run_started_at <= now() - interval '7 days' or not exists (
          select 1 from webhook_endpoint e join project p on p.id = e.project_id
          join environment v on v.id = e.environment_id and v.project_id = e.project_id join organization o on o.id = p.organization_id
          where e.id = d.endpoint_id and e.project_id = d.project_id and e.environment_id = d.environment_id
            and e.status = 'enabled' and e.deleted_at is null and p.status = 'active' and v.status = 'active' and o.status = 'active'
        )) order by d.created_at limit 100 for update of d skip locked
      ) update webhook_delivery d set status = case when stale.reason = 'endpoint_unavailable' then 'cancelled' else 'failed' end,
        next_attempt_at = null, last_error = stale.reason, updated_at = now() from stale where d.id = stale.id
    `);
    if (retain) {
      await transaction.execute(sql`
        with expired as (
          select id from webhook_delivery where status in ('succeeded', 'failed', 'cancelled') and updated_at < now() - interval '30 days'
          order by updated_at limit 1000 for update skip locked
        ) delete from webhook_delivery d using expired where d.id = expired.id
      `);
      await transaction.execute(sql`
        with expired as (
          select e.id from webhook_event e where e.recorded_at < now() - interval '30 days'
            and not exists (select 1 from webhook_delivery d where d.event_id = e.id)
          order by e.recorded_at limit 1000 for update of e skip locked
        ) delete from webhook_event e using expired where e.id = expired.id
      `);
    }
  });
}

async function claimDelivery(database: RelayKitDatabase) {
  return run(database, async (transaction) => {
    const [candidate] = await transaction.execute(sql`
      select d.id from webhook_delivery d
      join webhook_endpoint e on e.id = d.endpoint_id and e.project_id = d.project_id and e.environment_id = d.environment_id
      join project p on p.id = e.project_id join environment v on v.id = e.environment_id and v.project_id = e.project_id
      join organization o on o.id = p.organization_id
      where d.status = 'pending' and d.next_attempt_at <= now() and d.run_attempt_count < 8
        and d.run_started_at > now() - interval '7 days' and e.status = 'enabled' and e.deleted_at is null
        and p.status = 'active' and v.status = 'active' and o.status = 'active'
      order by d.next_attempt_at, d.created_at, d.id limit 1 for update of d skip locked
    `);
    if (!candidate) return undefined;
    const [delivery] = await transaction.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.id, String(candidate.id)));
    if (!delivery) return undefined;
    const [endpoint] = await transaction.select().from(schema.webhookEndpoint).where(and(
      eq(schema.webhookEndpoint.id, delivery.endpointId), eq(schema.webhookEndpoint.projectId, delivery.projectId), eq(schema.webhookEndpoint.environmentId, delivery.environmentId),
    )).for("share");
    if (!endpoint || endpoint.deletedAt || endpoint.status !== "enabled") return undefined;
    const [active] = await transaction.execute(sql`
      select p.id from project p join environment v on v.project_id = p.id join organization o on o.id = p.organization_id
      where p.id = ${delivery.projectId} and v.id = ${delivery.environmentId} and p.status = 'active' and v.status = 'active' and o.status = 'active'
      for share of p, v, o
    `);
    if (!active) return undefined;
    const [event] = await transaction.select().from(schema.webhookEvent).where(and(
      eq(schema.webhookEvent.id, delivery.eventId), eq(schema.webhookEvent.projectId, delivery.projectId), eq(schema.webhookEvent.environmentId, delivery.environmentId),
    ));
    if (!event) throw new Error("Webhook event is unavailable");
    const leaseToken = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const attemptId = `attempt_${randomUUID()}`;
    const [claimed] = await transaction.update(schema.webhookDelivery).set({
      status: "delivering", attemptCount: delivery.attemptCount + 1, runAttemptCount: delivery.runAttemptCount + 1,
      leaseToken, leasedUntil: sql`now() + interval '120 seconds'`, nextAttemptAt: null, updatedAt: sql`now()`,
    }).where(eq(schema.webhookDelivery.id, delivery.id)).returning();
    if (!claimed) throw new Error("Webhook claim did not return a delivery");
    await transaction.insert(schema.webhookDeliveryAttempt).values({
      id: attemptId, deliveryId: claimed.id, attemptNumber: claimed.attemptCount, replayCount: claimed.replayCount,
      signingSecretVersion: endpoint.signingSecretVersion, signatureTimestamp: timestamp,
    });
    return { delivery: claimed, endpoint, body: event.body, attemptId, timestamp, leaseToken };
  });
}

type ClaimedDelivery = NonNullable<Awaited<ReturnType<typeof claimDelivery>>>;
interface DeliveryOutcome {
  succeeded: boolean;
  retryable: boolean;
  httpStatus: number | null;
  errorCode: string | null;
}

async function finishDelivery(database: RelayKitDatabase, claim: ClaimedDelivery, outcome: DeliveryOutcome) {
  return run(database, async (transaction) => {
    const [delivery] = await transaction.select().from(schema.webhookDelivery).where(and(
      eq(schema.webhookDelivery.id, claim.delivery.id), eq(schema.webhookDelivery.status, "delivering"), eq(schema.webhookDelivery.leaseToken, claim.leaseToken),
    )).for("update");
    if (!delivery) return;
    const [clock] = await transaction.execute(sql`select floor(extract(epoch from now()) * 1000)::bigint as milliseconds`);
    const now = new Date(Number(clock?.milliseconds));
    const delay = backoff[delivery.runAttemptCount - 1];
    const nextAttemptAt = delay === undefined ? null : new Date(now.getTime() + Math.floor(delay * (1 + Math.random() * 0.2)));
    const retry = !outcome.succeeded && outcome.retryable && nextAttemptAt !== null
      && nextAttemptAt.getTime() < delivery.runStartedAt.getTime() + 7 * 86_400_000;
    await transaction.update(schema.webhookDeliveryAttempt).set({
      status: outcome.succeeded ? "succeeded" : "failed", httpStatus: outcome.httpStatus,
      errorCode: outcome.errorCode, finishedAt: now,
    }).where(and(eq(schema.webhookDeliveryAttempt.id, claim.attemptId), eq(schema.webhookDeliveryAttempt.status, "started")));
    await transaction.update(schema.webhookDelivery).set({
      status: outcome.succeeded ? "succeeded" : retry ? "pending" : "failed",
      nextAttemptAt: retry ? nextAttemptAt : null, deliveredAt: outcome.succeeded ? now : null,
      lastError: outcome.errorCode, leaseToken: null, leasedUntil: null, updatedAt: now,
    }).where(eq(schema.webhookDelivery.id, delivery.id));
  });
}

export function registerWebhookDeliveryWorker(app: FastifyInstance, database: RelayKitDatabase, encryptionKey: string) {
  const vault = createWebhookSecretVault(encryptionKey);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let maintenanceAt = 0;
  let retentionAt = 0;
  const processDelivery = async () => {
    if (stopped) return;
    const claim = await claimDelivery(database);
    if (!claim) return;
    let outcome: DeliveryOutcome;
    let secret: string;
    try {
      secret = vault.decrypt(claim.endpoint.encryptedSigningSecret, webhookSecretContext(claim.endpoint));
    } catch {
      await finishDelivery(database, claim, { succeeded: false, retryable: false, httpStatus: null, errorCode: "signing_unavailable" });
      return;
    }
    try {
      const headers = signWebhookRequest(secret, claim.body, { deliveryId: claim.delivery.id, replayCount: claim.delivery.replayCount, timestamp: claim.timestamp });
      const result = await postWebhookRequest(claim.delivery.url, claim.body, {
        ...headers, "x-relayrtc-signing-key-version": String(claim.endpoint.signingSecretVersion), "user-agent": "RelayRTC-Webhooks/1.0",
      });
      const succeeded = result.statusCode >= 200 && result.statusCode < 300;
      outcome = { succeeded, retryable: result.statusCode === 408 || result.statusCode === 425 || result.statusCode === 429 || result.statusCode >= 500,
        httpStatus: result.statusCode >= 100 && result.statusCode <= 599 ? result.statusCode : null, errorCode: succeeded ? null : `http_${result.statusCode}` };
    } catch (error) {
      outcome = { succeeded: false, retryable: !(error instanceof WebhookDestinationError), httpStatus: error instanceof WebhookDestinationError ? error.statusCode ?? null : null,
        errorCode: error instanceof WebhookDestinationError ? "invalid_destination" : error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? "timeout" : "network_error" };
    }
    await finishDelivery(database, claim, outcome);
  };
  const tick = async () => {
    try {
      if (Date.now() - maintenanceAt >= 10_000) {
        const retain = Date.now() - retentionAt >= 60_000;
        await maintainDeliveries(database, retain);
        maintenanceAt = Date.now();
        if (retain) retentionAt = maintenanceAt;
      }
      const results = await Promise.allSettled(Array.from({ length: 4 }, processDelivery));
      if (results.some((result) => result.status === "rejected"))
        app.log.error("Webhook delivery could not reach its store; durable leases will recover unfinished attempts");
    } catch {
      app.log.error("Webhook delivery worker could not reach its store; retrying");
    }
    if (!stopped) timer = setTimeout(() => { pending = tick(); }, 1_000).unref();
  };
  app.addHook("onReady", (done) => { pending = tick(); done(); });
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}
