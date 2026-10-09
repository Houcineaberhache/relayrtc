import type { RelayKitDatabase } from "@relayrtc/database";
import { sql } from "drizzle-orm";

export async function refreshUsageAggregates(
  database: RelayKitDatabase,
  organizationId: string,
  startedAt: Date,
  endedAt = new Date(),
) {
  if (
    !Number.isFinite(startedAt.getTime()) ||
    !Number.isFinite(endedAt.getTime()) ||
    endedAt <= startedAt ||
    endedAt.getTime() - startedAt.getTime() > 366 * 86400_000
  )
    throw new Error("Provide a positive aggregation window of at most 366 days");
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
    );
    const [organization] = await transaction.execute(
      sql`select id from organization where id = ${organizationId}`,
    );
    if (!organization) throw new Error("Organization not found");
    const start = new Date(
      Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), 1),
    ).toISOString();
    const end = endedAt.toISOString();
    await transaction.execute(
      sql`delete from usage_aggregate where organization_id = ${organizationId} and window_started_at >= ${start}::timestamptz and window_started_at < ${end}::timestamptz`,
    );
    await transaction.execute(sql`
      insert into usage_aggregate (id, organization_id, project_id, environment_id, granularity, window_started_at, window_ended_at, metrics, updated_at)
      select 'usage_' || md5(concat_ws(':', organization_id, project_id, environment_id, granularity, extract(epoch from bucket)::text)),
        organization_id, project_id, environment_id, granularity,
        bucket, (bucket at time zone 'UTC' + ('1 ' || granularity)::interval) at time zone 'UTC', jsonb_object_agg(metric, total), now()
      from (
        select organization_id, project_id, environment_id, granularity, metric,
          date_trunc(granularity, occurred_at at time zone 'UTC') at time zone 'UTC' as bucket, sum(value) as total
        from usage_event cross join (values ('hour'), ('day'), ('month')) granularities(granularity)
        where organization_id = ${organizationId} and occurred_at >= ${start}::timestamptz and occurred_at < ${end}::timestamptz
        group by organization_id, project_id, environment_id, granularity, metric, bucket
      ) grouped_metrics group by organization_id, project_id, environment_id, granularity, bucket
    `);
  });
}
