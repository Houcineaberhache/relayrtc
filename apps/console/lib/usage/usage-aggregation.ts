import type { RelayKitDatabase } from "@relayrtc/database"
import { sql } from "drizzle-orm"

export async function refreshUsageAggregates(
  database: RelayKitDatabase,
  organizationId: string
) {
  for (const granularity of ["hour", "day", "month"] as const) {
    await database.execute(sql`
      insert into usage_aggregate (
        id, organization_id, project_id, environment_id, granularity,
        window_started_at, window_ended_at, metrics, updated_at
      )
      select
        'usage_' || md5(concat_ws(':', organization_id, project_id, environment_id, cast(${granularity} as text), bucket::text)),
        organization_id, project_id, environment_id, cast(${granularity} as text),
        bucket,
        bucket + ('1 ' || cast(${granularity} as text))::interval,
        jsonb_object_agg(metric, total), now()
      from (
        select organization_id, project_id, environment_id, metric,
          date_trunc(cast(${granularity} as text), occurred_at) bucket, sum(value) total
        from usage_event where organization_id = ${organizationId}
        group by organization_id, project_id, environment_id, metric, bucket
      ) grouped_metrics
      group by organization_id, project_id, environment_id, bucket
      on conflict (organization_id, project_id, environment_id, granularity, window_started_at)
      do update set metrics = excluded.metrics, window_ended_at = excluded.window_ended_at, updated_at = now()
    `)
  }
}
