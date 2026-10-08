import type { RelayKitDatabase } from "@relayrtc/database";
import { projectUsageResponseSchema, type ProjectUsageResponse } from "@relayrtc/validation";
import { sql } from "drizzle-orm";

export interface ProjectUsageScope {
  organizationId: string;
  projectId: string;
  environmentId: string | null;
}

export type UsageRange = "24h" | "7d" | "14d" | "30d";

export async function getProjectUsage(
  database: RelayKitDatabase,
  scope: ProjectUsageScope,
  range: UsageRange,
  endedAt = new Date(),
): Promise<ProjectUsageResponse> {
  const duration = { "24h": 1, "7d": 7, "14d": 14, "30d": 30 }[range] * 86_400_000;
  const startedAt = new Date(endedAt.getTime() - duration);
  const granularity = range === "24h" ? "hour" : "day";
  const result = await database.execute(sql`
    with bounds as (
      select ${startedAt.toISOString()}::timestamptz as starts,
        ${endedAt.toISOString()}::timestamptz as ends
    ), scoped_rooms as (
      select r.* from room r
      join project pr on pr.id = r.project_id
      where r.project_id = ${scope.projectId} and pr.organization_id = ${scope.organizationId}
        ${scope.environmentId === null ? sql`` : sql`and r.environment_id = ${scope.environmentId}`}
    ), scoped_sessions as (
      select s.*, p.left_at, p.id as scoped_participant_id, r.ended_at as room_ended_at
      from participant_session s
      join participant p on p.id = s.participant_id
      join scoped_rooms r on r.id = p.room_id
    ), clipped_connections as (
      select s.id as session_id, s.scoped_participant_id as participant_id,
        greatest(i.started_at, s.joined_at, b.starts) as starts,
        least(
          coalesce(i.ended_at,
            case when s.connection_state = 'connected' then b.ends else s.disconnected_at end,
            i.started_at),
          s.left_at, s.room_ended_at, b.ends
        ) as ends
      from participant_connection_interval i
      join scoped_sessions s on s.id = i.session_id
      cross join bounds b
      where i.started_at < b.ends and coalesce(i.ended_at, b.ends) > b.starts
    ), connections as (
      select * from clipped_connections where ends > starts
    ), preceding_connections as (
      select *, max(ends) over (
        partition by participant_id order by starts, ends, session_id
        rows between unbounded preceding and 1 preceding
      ) as previous_end from connections
    ), connection_groups as (
      select *, sum(case when previous_end is null or starts > previous_end then 1 else 0 end)
        over (partition by participant_id order by starts, ends, session_id rows unbounded preceding) as group_id
      from preceding_connections
    ), participant_intervals as (
      select participant_id, min(starts) as starts, max(ends) as ends
      from connection_groups group by participant_id, group_id
    ), participant_events as (
      select starts as at, 1 as delta from participant_intervals
      union all select ends as at, -1 as delta from participant_intervals
    ), participant_peak as (
      select coalesce(max(active), 0) as value from (
        select sum(sum(delta)) over (order by at) as active from participant_events group by at
      ) ranked
    ), clipped_rooms as (
      select greatest(coalesce(r.started_at, r.created_at), b.starts) as starts,
        least(coalesce(r.ended_at,
          case when r.status in ('active', 'ending') then b.ends else r.started_at end,
          r.created_at), b.ends) as ends
      from scoped_rooms r cross join bounds b
      where r.started_at is not null or r.status in ('active', 'ending')
    ), room_intervals as (
      select * from clipped_rooms where ends > starts
    ), room_events as (
      select starts as at, 1 as delta from room_intervals
      union all select ends as at, -1 as delta from room_intervals
    ), room_peak as (
      select coalesce(max(active), 0) as value from (
        select sum(sum(delta)) over (order by at) as active from room_events group by at
      ) ranked
    ), event_totals as (
      select ue.metric, sum(ue.value) as value from usage_event ue cross join bounds b
      where ue.project_id = ${scope.projectId} and ue.organization_id = ${scope.organizationId}
        ${scope.environmentId === null ? sql`` : sql`and ue.environment_id = ${scope.environmentId}`}
        and ue.occurred_at >= b.starts and ue.occurred_at < b.ends
      group by ue.metric
    ), buckets as (
      select greatest(at at time zone 'UTC', b.starts) as starts,
        least((at + ('1 ' || ${granularity})::interval) at time zone 'UTC', b.ends) as ends
      from bounds b cross join lateral generate_series(
        date_trunc(${granularity}, b.starts at time zone 'UTC'),
        b.ends at time zone 'UTC', ('1 ' || ${granularity})::interval
      ) at
      where at at time zone 'UTC' < b.ends
    ), history as (
      select not exists (
        select 1 from scoped_sessions s cross join bounds b
        where s.metering_started_at > s.joined_at and s.metering_started_at > b.starts
          and s.joined_at < b.ends
          and coalesce(s.disconnected_at, s.left_at, s.room_ended_at, b.ends) > b.starts
      ) as complete
    )
    select jsonb_build_object(
      'participantSeconds', coalesce((select sum(extract(epoch from ends - starts)) from participant_intervals), 0),
      'audioParticipantSeconds', coalesce((select value from event_totals where metric = 'audioParticipantSeconds'), 0),
      'videoParticipantSeconds', coalesce((select value from event_totals where metric = 'videoParticipantSeconds'), 0),
      'screenShareSeconds', coalesce((select value from event_totals where metric = 'screenShareSeconds'), 0),
      'screenShareIngressBytes', coalesce((select value from event_totals where metric = 'screenShareIngressBytes'), 0),
      'screenShareEgressBytes', coalesce((select value from event_totals where metric = 'screenShareEgressBytes'), 0),
      'sfuIngressBytes', coalesce((select value from event_totals where metric = 'sfuIngressBytes'), 0),
      'sfuEgressBytes', coalesce((select value from event_totals where metric = 'sfuEgressBytes'), 0),
      'turnIngressBytes', coalesce((select value from event_totals where metric = 'turnIngressBytes'), 0),
      'turnEgressBytes', coalesce((select value from event_totals where metric = 'turnEgressBytes'), 0),
      'roomsCreated', (select count(*) from scoped_rooms r, bounds b where r.created_at >= b.starts and r.created_at < b.ends),
      'peakConcurrentParticipants', (select value from participant_peak),
      'peakConcurrentRooms', (select value from room_peak),
      'signalingConnections', (select count(*) from scoped_sessions s, bounds b where s.joined_at >= b.starts and s.joined_at < b.ends),
      'signalingConnectionSeconds', coalesce((select sum(extract(epoch from ends - starts)) from connections), 0),
      'messagesIn', coalesce((select value from event_totals where metric = 'messagesIn'), 0),
      'messagesOut', coalesce((select value from event_totals where metric = 'messagesOut'), 0)
    ) as summary,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'startedAt', to_char(b.starts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endedAt', to_char(b.ends at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'participantSeconds', coalesce((select sum(extract(epoch from
        least(p.ends, b.ends) - greatest(p.starts, b.starts))) from participant_intervals p
        where p.starts < b.ends and p.ends > b.starts), 0),
      'roomsCreated', (select count(*) from scoped_rooms r where r.created_at >= b.starts and r.created_at < b.ends)
    ) order by b.starts), '[]'::jsonb) from buckets b) as buckets,
    (select complete from history) as complete
  `);
  const row = result[0] as { summary: unknown; buckets: unknown; complete: boolean } | undefined;
  return projectUsageResponseSchema.parse({
    scope,
    window: {
      range,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      timezone: "UTC",
      endExclusive: true,
    },
    summary: row?.summary,
    buckets: row?.buckets,
    dataQuality: {
      sessionHistory: row?.complete ? "complete" : "partial",
      messageHistory: row?.complete ? "complete" : "partial",
    },
  });
}
