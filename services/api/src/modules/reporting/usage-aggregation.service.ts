import { createHash } from "node:crypto";
import type { RelayKitDatabase } from "@relayrtc/database";
import { canonicalUsageMetric } from "@relayrtc/types";
import { reportingUsageMetricsSchema } from "@relayrtc/validation";
import { sql } from "drizzle-orm";
import {
  createUsageAggregationQuery,
  usageDataQuality,
  type UsageReportScope,
} from "./usage-query.js";

type Executor = Pick<RelayKitDatabase, "execute">;
interface ScopeRow {
  project_id: string | null;
  environment_id: string | null;
}
const hour = 3600_000;
const bucketStart = (at: Date, granularity: "hour" | "day" | "month") => {
  const result = new Date(at);
  result.setUTCMinutes(0, 0, 0);
  if (granularity !== "hour") result.setUTCHours(0);
  if (granularity === "month") result.setUTCDate(1);
  return result;
};
const bucketEnd = (at: Date, granularity: "hour" | "day" | "month") => {
  const result = new Date(at);
  if (granularity === "hour") result.setUTCHours(result.getUTCHours() + 1);
  else if (granularity === "day") result.setUTCDate(result.getUTCDate() + 1);
  else result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
};
const identity = (scope: UsageReportScope, granularity: string, starts: Date) =>
  "usage_" +
  createHash("sha256")
    .update(
      JSON.stringify([
        scope.organizationId,
        scope.projectId,
        scope.environmentId,
        granularity,
        starts.toISOString(),
      ]),
    )
    .digest("hex");

async function writeAggregate(
  database: Executor,
  scope: UsageReportScope,
  granularity: "hour" | "day" | "month",
  starts: Date,
  through: Date,
  metrics: Record<string, number>,
  quality: Record<string, string>,
) {
  const ends = bucketEnd(starts, granularity);
  await database.execute(sql`
    insert into usage_aggregate (id, organization_id, project_id, environment_id, granularity, window_started_at, window_ended_at, source_through_at, metrics, data_quality, updated_at)
    values (${identity(scope, granularity, starts)}, ${scope.organizationId}, ${scope.projectId}, ${scope.environmentId}, ${granularity}, ${starts.toISOString()}::timestamptz, ${ends.toISOString()}::timestamptz,
      ${through.toISOString()}::timestamptz, ${JSON.stringify(metrics)}::jsonb, ${JSON.stringify(quality)}::jsonb, now())
    on conflict (organization_id, project_id, environment_id, granularity, window_started_at) do update set
      metrics = excluded.metrics, data_quality = excluded.data_quality, source_through_at = excluded.source_through_at, window_ended_at = excluded.window_ended_at, updated_at = excluded.updated_at
  `);
}

async function rollup(
  database: Executor,
  scope: UsageReportScope,
  granularity: "day" | "month",
  starts: Date,
  now: Date,
) {
  const ends = bucketEnd(starts, granularity);
  const through = new Date(Math.min(ends.getTime(), now.getTime()));
  const [row] = await database.execute(sql`
    with source as (
      select metrics, data_quality from usage_aggregate where organization_id = ${scope.organizationId}
        and project_id is not distinct from ${scope.projectId} and environment_id is not distinct from ${scope.environmentId}
        and granularity = 'hour' and window_started_at >= ${starts.toISOString()}::timestamptz and window_started_at < ${ends.toISOString()}::timestamptz
    ), totals as (
      select key, case when key in ('peakConcurrentParticipants', 'peakConcurrentRooms') then max(value::double precision) else sum(value::double precision) end as total
      from source cross join lateral jsonb_each_text(metrics) where key not in ('averageConcurrentParticipants', 'participantMinutesDerived') group by key
    ) select coalesce((select jsonb_object_agg(key, total) from totals), '{}'::jsonb) as metrics,
      coalesce((select bool_and(coalesce(data_quality->>'sessionHistory', 'partial') = 'complete') from source), true) as complete,
      (select case when bool_and(data_quality->>'turnTraffic' = 'authoritative') then 'authoritative'
        when bool_or(data_quality->>'turnTraffic' in ('authoritative', 'partial')) then 'partial' else 'unavailable' end from source) as turn_coverage,
      exists (select 1 from usage_aggregation_dirty where organization_id = ${scope.organizationId}
        and hour_started_at >= ${starts.toISOString()}::timestamptz and hour_started_at < ${through.toISOString()}::timestamptz) as pending
  `);
  const metrics = (row?.metrics ?? {}) as Record<string, number>;
  metrics.averageConcurrentParticipants =
    (metrics.participantSeconds ?? 0) / ((through.getTime() - starts.getTime()) / 1000);
  metrics.participantMinutesDerived = (metrics.participantSeconds ?? 0) / 60;
  await writeAggregate(database, scope, granularity, starts, through, metrics, {
    ...usageDataQuality(row?.complete === true),
    aggregation: row?.pending === true ? "pending" : "complete",
    turnTraffic: usageDataQuality(true, row?.turn_coverage).turnTraffic,
    mediaDurations: "observation_time",
  });
}

export async function processUsageAggregation(
  database: RelayKitDatabase,
  options: { now?: Date; batchSize?: number; retentionDays?: number; organizationId?: string } = {},
) {
  const now = options.now ?? new Date();
  const limit = options.batchSize ?? 24;
  const retentionDays = options.retentionDays ?? 365;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 168 ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 30 ||
    retentionDays > 3650
  )
    throw new Error("Invalid usage aggregation batch configuration");
  const cutoff = new Date(now.getTime() - retentionDays * 86400_000);
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`set local statement_timeout = '30s'`);
    await transaction.execute(sql`set local lock_timeout = '5s'`);
    const [lock] = await transaction.execute(
      sql`select pg_try_advisory_xact_lock(hashtextextended('relayrtc:usage-aggregation', 0)) as acquired`,
    );
    if (lock?.acquired !== true)
      return { status: "busy" as const, processedHours: 0, pendingHours: null, lagSeconds: null };
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('relayrtc:usage-retention', 0))`,
    );
    await transaction.execute(
      sql`delete from usage_aggregation_dirty where hour_started_at + interval '1 hour' < ${cutoff.toISOString()}::timestamptz`,
    );
    await transaction.execute(
      sql`delete from usage_aggregation_dirty d where not exists (select 1 from usage_history_organization o where o.id = d.organization_id)`,
    );
    const scheduled = await transaction.execute(sql`
      select c.organization_id, c.scheduled_through_at from usage_aggregation_checkpoint c
      where c.scheduled_through_at <= ${now.toISOString()}::timestamptz
        ${options.organizationId ? sql`and c.organization_id = ${options.organizationId}` : sql``}
      order by c.scheduled_through_at, c.organization_id limit 100 for update
    `);
    for (const checkpoint of scheduled) {
      await transaction.execute(sql`
        insert into usage_aggregation_dirty (organization_id, hour_started_at)
        select ${checkpoint.organization_id}::text, at from generate_series(
          date_trunc('hour', greatest(${checkpoint.scheduled_through_at}::timestamptz, ${cutoff.toISOString()}::timestamptz) at time zone 'UTC') at time zone 'UTC',
          ${bucketStart(now, "hour").toISOString()}::timestamptz, interval '1 hour') at
        where exists (select 1 from usage_history_room r where r.organization_id = ${checkpoint.organization_id}
          and r.started_at < at + interval '1 hour' and least(r.ended_at, r.owner_expires_at, ${now.toISOString()}::timestamptz) > at)
        on conflict do nothing
      `);
      await transaction.execute(
        sql`update usage_aggregation_checkpoint set scheduled_through_at = ${now.toISOString()}::timestamptz where organization_id = ${checkpoint.organization_id}`,
      );
    }
    const dirty = await transaction.execute(sql`
      select organization_id, hour_started_at from usage_aggregation_dirty where hour_started_at < ${now.toISOString()}::timestamptz
        ${options.organizationId ? sql`and organization_id = ${options.organizationId}` : sql``}
      order by hour_started_at, organization_id limit ${limit} for update skip locked
    `);
    const parents = new Map<
      string,
      { scope: UsageReportScope; granularity: "day" | "month"; starts: Date }
    >();
    for (const item of dirty) {
      const organizationId = String(item.organization_id);
      const starts = new Date(String(item.hour_started_at));
      const through = new Date(Math.min(starts.getTime() + hour, now.getTime()));
      const scopes = (await transaction.execute(sql`
        select null::text as project_id, null::text as environment_id
        union all select id, null from usage_history_project where organization_id = ${organizationId}
        union all select e.project_id, e.id from usage_history_environment e join usage_history_project p on p.id = e.project_id where p.organization_id = ${organizationId}
      `)) as unknown as ScopeRow[];
      for (const dimension of scopes) {
        const scope = {
          organizationId,
          projectId: dimension.project_id,
          environmentId: dimension.environment_id,
        };
        const [row] = await transaction.execute(
          createUsageAggregationQuery(scope, starts, through),
        );
        const summary = reportingUsageMetricsSchema.parse(row?.metrics);
        const metrics: Record<string, number> = {
          ...summary,
          participantMinutesDerived: summary.participantSeconds / 60,
        };
        for (const [metric, value] of Object.entries(summary))
          metrics[canonicalUsageMetric(metric)] = value;
        await writeAggregate(transaction, scope, "hour", starts, through, metrics, {
          ...usageDataQuality(row?.complete === true),
          aggregation: "complete",
          turnTraffic: usageDataQuality(true, row?.turn_coverage).turnTraffic,
          mediaDurations: "observation_time",
        });
        for (const granularity of ["day", "month"] as const) {
          const parentStart = bucketStart(starts, granularity);
          parents.set(identity(scope, granularity, parentStart), {
            scope,
            granularity,
            starts: parentStart,
          });
        }
      }
      await transaction.execute(
        sql`delete from usage_aggregation_dirty where organization_id = ${organizationId} and hour_started_at = ${starts.toISOString()}::timestamptz`,
      );
      await transaction.execute(
        sql`update usage_aggregation_checkpoint set last_success_at = ${now.toISOString()}::timestamptz, processed_hours = processed_hours + 1 where organization_id = ${organizationId}`,
      );
    }
    for (const parent of parents.values())
      await rollup(transaction, parent.scope, parent.granularity, parent.starts, now);
    const [backlog] =
      await transaction.execute(sql`select count(*)::int as pending, extract(epoch from (${now.toISOString()}::timestamptz - min(hour_started_at)))::double precision as lag from usage_aggregation_dirty
      where hour_started_at < ${now.toISOString()}::timestamptz ${options.organizationId ? sql`and organization_id = ${options.organizationId}` : sql``}`);
    return {
      status: "processed" as const,
      processedHours: dirty.length,
      pendingHours: Number(backlog?.pending ?? 0),
      lagSeconds: backlog?.lag == null ? null : Number(backlog.lag),
    };
  });
}

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
  await database.transaction(async (transaction) => {
    const [organization] = await transaction.execute(
      sql`select id from usage_history_organization where id = ${organizationId}`,
    );
    if (!organization) throw new Error("Organization not found");
    await transaction.execute(
      sql`select queue_usage_aggregation(${organizationId}, ${startedAt.toISOString()}::timestamptz, ${endedAt.toISOString()}::timestamptz)`,
    );
  });
  let result;
  do {
    result = await processUsageAggregation(database, {
      organizationId,
      now: endedAt,
      batchSize: 168,
      retentionDays: 3650,
    });
  } while (result.status !== "busy" && result.pendingHours > 0);
  return result;
}
