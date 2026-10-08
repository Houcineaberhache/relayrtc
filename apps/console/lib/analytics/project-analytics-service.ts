import type { RelayKitDatabase } from '@relayrtc/database'
import { sql } from 'drizzle-orm'

export type AnalyticsRange =
  | 'live'
  | '24h'
  | '7d'
  | '30d'

export interface ProjectAnalyticsSummary {
  peakConcurrent: number
  totalSessions: number
  averageSessionSeconds: number
  participantSeconds: number
  connectionSuccessRate: number
}

export interface ProjectAnalyticsTrafficPoint {
  label: string
  participants: number
  sessions: number
}

export interface ProjectAnalyticsNetworkPoint {
  label: string
  sfuIngress: number
  sfuEgress: number
  turnIngress: number
  turnEgress: number
}

export interface ProjectAnalyticsQualityPoint {
  label: string
  rtt: number
  jitter: number
  packetLoss: number
}

export interface ProjectAnalyticsRegion {
  name: string
  sessions: number
}

export interface ProjectAnalyticsQualityDistribution {
  quality: string
  count: number
}

export interface ProjectAnalyticsRoom {
  id: string
  name: string
  participants: number
  minutes: number
}

export interface ProjectAnalyticsData {
  summary: ProjectAnalyticsSummary

  network: {
    sfuIngress: number
    sfuEgress: number
    turnIngress: number
    turnEgress: number
  }

  traffic: ProjectAnalyticsTrafficPoint[]
  networkSeries: ProjectAnalyticsNetworkPoint[]
  quality: ProjectAnalyticsQualityPoint[]
  regions: ProjectAnalyticsRegion[]
  qualityDistribution: ProjectAnalyticsQualityDistribution[]
  topRooms: ProjectAnalyticsRoom[]
}

const numeric = (value: unknown) =>
  value === null || value === undefined
    ? 0
    : Number(value)

function rangeSql(range: AnalyticsRange) {
  switch (range) {
    case 'live':
      return {
        start: sql`now() - interval '15 minutes'`,
        bucket: sql`interval '1 minute'`,
        truncate: sql`'minute'`,
        format: 'HH24:MI',
      }

    case '24h':
      return {
        start: sql`now() - interval '24 hours'`,
        bucket: sql`interval '1 hour'`,
        truncate: sql`'hour'`,
        format: 'HH24:00',
      }

    case '30d':
      return {
        start: sql`now() - interval '30 days'`,
        bucket: sql`interval '1 day'`,
        truncate: sql`'day'`,
        format: 'Mon DD',
      }

    default:
      return {
        start: sql`now() - interval '7 days'`,
        bucket: sql`interval '1 day'`,
        truncate: sql`'day'`,
        format: 'Mon DD',
      }
  }
}

export async function getProjectAnalytics(
  database: RelayKitDatabase,
  projectId: string,
  range: AnalyticsRange,
  environmentId?: string | null,
): Promise<ProjectAnalyticsData> {
  const rangeConfig = rangeSql(range)

  const environmentFilter = environmentId
    ? sql`and r.environment_id = ${environmentId}`
    : sql``

  const usageEnvironmentFilter = environmentId
    ? sql`and ue.environment_id = ${environmentId}`
    : sql``

  const summaryResult =
    await database.execute(sql`
      with scoped_rooms as (
        select *
        from room r
        where r.project_id = ${projectId}
          ${environmentFilter}
      ),

      scoped_participants as (
        select
          p.*,
          r.ended_at as room_ended_at,

          (
            select max(s.disconnected_at)
            from participant_session s
            where s.participant_id = p.id
              and s.connection_state in (
                'disconnected',
                'failed'
              )
          ) as session_disconnected_at,

          (
            select count(*)
            from participant_session s
            where s.participant_id = p.id
              and s.connection_state in (
                'connected',
                'reconnecting'
              )
          ) as active_sessions

        from participant p

        join scoped_rooms r
          on r.id = p.room_id
      ),

      normalized_participants as (
        select
          p.*,

          case
            when p.left_at is not null
              then p.left_at

            when p.room_ended_at is not null
              then p.room_ended_at

            when p.active_sessions > 0
              then now()

            when p.session_disconnected_at is not null
              then p.session_disconnected_at

            else p.joined_at
          end as effective_left_at

        from scoped_participants p
      ),

      scoped_sessions as (
        select s.*

        from participant_session s

        join scoped_participants p
          on p.id = s.participant_id

        where s.joined_at >= ${rangeConfig.start}
      ),

      participant_events as (
        select
          greatest(
            joined_at,
            ${rangeConfig.start}
          ) as at,
          1 as delta

        from normalized_participants

        where joined_at < now()
          and effective_left_at >= ${rangeConfig.start}

        union all

        select
          least(
            effective_left_at,
            now()
          ) as at,
          -1 as delta

        from normalized_participants

        where joined_at < now()
          and effective_left_at >= ${rangeConfig.start}
      ),

      concurrency as (
        select
          coalesce(
            max(active),
            0
          ) value

        from (
          select
            sum(sum(delta)) over (
              order by at
            ) active

          from participant_events

          group by at
        ) values
      )

      select
        (
          select value
          from concurrency
        ) "peakConcurrent",

        (
          select count(*)
          from scoped_sessions
        ) "totalSessions",

        coalesce(
          (
            select avg(
              case
                when connection_state in (
                  'connected',
                  'reconnecting'
                )
                  then connection_seconds +
                    extract(
                      epoch from (
                        now() -
                        coalesce(
                          reconnected_at,
                          joined_at
                        )
                      )
                    )

                else connection_seconds
              end
            )

            from scoped_sessions
          ),
          0
        ) "averageSessionSeconds",

        coalesce(
          (
            select sum(
              case
                when connection_state in (
                  'connected',
                  'reconnecting'
                )
                  then connection_seconds +
                    extract(
                      epoch from (
                        now() -
                        coalesce(
                          reconnected_at,
                          joined_at
                        )
                      )
                    )

                else connection_seconds
              end
            )

            from scoped_sessions
          ),
          0
        ) "participantSeconds",

        coalesce(
          (
            select
              case
                when count(*) = 0
                  then 0

                else (
                  count(*) filter (
                    where connection_state <> 'failed'
                  )::double precision
                  /
                  count(*)::double precision
                ) * 100
              end

            from scoped_sessions
          ),
          0
        ) "connectionSuccessRate"
    `)

  const summaryRow =
    summaryResult[0] as
      | Record<string, unknown>
      | undefined

  const networkResult =
    await database.execute(sql`
      select
        coalesce(
          sum(value) filter (
            where metric = 'sfuIngressBytes'
          ),
          0
        ) "sfuIngress",

        coalesce(
          sum(value) filter (
            where metric = 'sfuEgressBytes'
          ),
          0
        ) "sfuEgress",

        coalesce(
          sum(value) filter (
            where metric = 'turnIngressBytes'
          ),
          0
        ) "turnIngress",

        coalesce(
          sum(value) filter (
            where metric = 'turnEgressBytes'
          ),
          0
        ) "turnEgress"

      from usage_event ue

      where ue.project_id = ${projectId}
        and ue.occurred_at >= ${rangeConfig.start}
        ${usageEnvironmentFilter}
    `)

  const networkRow =
    networkResult[0] as
      | Record<string, unknown>
      | undefined

  const trafficResult =
    await database.execute(sql`
      with buckets as (
        select generate_series(
          date_trunc(
            ${rangeConfig.truncate},
            ${rangeConfig.start}
          ),
          date_trunc(
            ${rangeConfig.truncate},
            now()
          ),
          ${rangeConfig.bucket}
        ) as bucket
      ),

      scoped_rooms as (
        select *
        from room r
        where r.project_id = ${projectId}
          ${environmentFilter}
      ),

      scoped_participants as (
        select
          p.*,
          r.ended_at as room_ended_at,

          (
            select max(s.disconnected_at)
            from participant_session s
            where s.participant_id = p.id
              and s.connection_state in (
                'disconnected',
                'failed'
              )
          ) as session_disconnected_at,

          (
            select count(*)
            from participant_session s
            where s.participant_id = p.id
              and s.connection_state in (
                'connected',
                'reconnecting'
              )
          ) as active_sessions

        from participant p

        join scoped_rooms r
          on r.id = p.room_id
      ),

      normalized_participants as (
        select
          p.*,

          case
            when p.left_at is not null
              then p.left_at

            when p.room_ended_at is not null
              then p.room_ended_at

            when p.active_sessions > 0
              then now()

            when p.session_disconnected_at is not null
              then p.session_disconnected_at

            else p.joined_at
          end as effective_left_at

        from scoped_participants p
      )

      select
        to_char(
          b.bucket,
          ${rangeConfig.format}
        ) label,

        (
          select count(*)
          from normalized_participants p

          where p.joined_at <
            b.bucket + ${rangeConfig.bucket}

            and p.effective_left_at >
              b.bucket
        ) participants,

        (
          select count(*)

          from participant_session s

          join scoped_participants p
            on p.id = s.participant_id

          where s.joined_at >= b.bucket
            and s.joined_at <
              b.bucket + ${rangeConfig.bucket}
        ) sessions

      from buckets b

      order by b.bucket
    `)

  const networkSeriesResult =
    await database.execute(sql`
      with buckets as (
        select generate_series(
          date_trunc(
            ${rangeConfig.truncate},
            ${rangeConfig.start}
          ),
          date_trunc(
            ${rangeConfig.truncate},
            now()
          ),
          ${rangeConfig.bucket}
        ) as bucket
      )

      select
        to_char(
          b.bucket,
          ${rangeConfig.format}
        ) label,

        coalesce(
          sum(ue.value) filter (
            where ue.metric = 'sfuIngressBytes'
          ),
          0
        ) "sfuIngress",

        coalesce(
          sum(ue.value) filter (
            where ue.metric = 'sfuEgressBytes'
          ),
          0
        ) "sfuEgress",

        coalesce(
          sum(ue.value) filter (
            where ue.metric = 'turnIngressBytes'
          ),
          0
        ) "turnIngress",

        coalesce(
          sum(ue.value) filter (
            where ue.metric = 'turnEgressBytes'
          ),
          0
        ) "turnEgress"

      from buckets b

      left join usage_event ue
        on ue.project_id = ${projectId}

        and ue.occurred_at >= b.bucket

        and ue.occurred_at <
          b.bucket + ${rangeConfig.bucket}

        ${usageEnvironmentFilter}

      group by b.bucket

      order by b.bucket
    `)

  const qualityResult =
    await database.execute(sql`
      with buckets as (
        select generate_series(
          date_trunc(
            ${rangeConfig.truncate},
            ${rangeConfig.start}
          ),
          date_trunc(
            ${rangeConfig.truncate},
            now()
          ),
          ${rangeConfig.bucket}
        ) as bucket
      ),

      scoped_quality as (
        select q.*

        from rtc_quality_metric q

        join room r
          on r.id = q.room_id

        where r.project_id = ${projectId}

          ${environmentFilter}

          and q.bucket_started_at >=
            ${rangeConfig.start}
      )

      select
        to_char(
          b.bucket,
          ${rangeConfig.format}
        ) label,

        coalesce(
          sum(q.round_trip_time_sum)
          /
          nullif(
            sum(
              q.round_trip_time_sample_count
            ),
            0
          ),
          0
        ) rtt,

        coalesce(
          sum(q.jitter_sum)
          /
          nullif(
            sum(
              q.jitter_sample_count
            ),
            0
          ),
          0
        ) jitter,

        coalesce(
          (
            sum(
              q.packets_lost
            )::double precision
            /
            nullif(
              (
                sum(
                  q.packets_received
                ) +
                sum(
                  q.packets_lost
                )
              ),
              0
            )
          ) * 100,
          0
        ) "packetLoss"

      from buckets b

      left join scoped_quality q
        on q.bucket_started_at >= b.bucket

        and q.bucket_started_at <
          b.bucket + ${rangeConfig.bucket}

      group by b.bucket

      order by b.bucket
    `)

  const regionsResult =
    await database.execute(sql`
      select
        coalesce(
          nullif(s.country, ''),
          'Unknown'
        ) name,

        count(*) sessions

      from participant_session s

      join participant p
        on p.id = s.participant_id

      join room r
        on r.id = p.room_id

      where r.project_id = ${projectId}

        and s.joined_at >=
          ${rangeConfig.start}

        ${environmentFilter}

      group by s.country

      order by sessions desc

      limit 8
    `)

  const qualityDistributionResult =
    await database.execute(sql`
      select
        q.latest_quality quality,
        count(*) count

      from rtc_quality_metric q

      join room r
        on r.id = q.room_id

      where r.project_id = ${projectId}

        ${environmentFilter}

        and q.bucket_started_at >=
          ${rangeConfig.start}

      group by q.latest_quality

      order by
        case q.latest_quality
          when 'excellent' then 1
          when 'good' then 2
          when 'poor' then 3
          when 'critical' then 4
          when 'lost' then 5
          else 6
        end
    `)

  const topRoomsResult =
    await database.execute(sql`
      with scoped_rooms as (
        select *
        from room r

        where r.project_id = ${projectId}

          ${environmentFilter}

          and r.created_at >=
            ${rangeConfig.start}
      ),

      scoped_participants as (
        select
          p.*,
          r.ended_at as room_ended_at,

          case
            when p.left_at is not null
              then p.left_at

            when r.ended_at is not null
              then r.ended_at

            when exists (
              select 1

              from participant_session s

              where s.participant_id = p.id

                and s.connection_state in (
                  'connected',
                  'reconnecting'
                )
            )
              then now()

            else coalesce(
              (
                select max(
                  s.disconnected_at
                )

                from participant_session s

                where s.participant_id = p.id
              ),
              p.joined_at
            )
          end as effective_left_at

        from participant p

        join scoped_rooms r
          on r.id = p.room_id
      )

      select
        r.id,
        r.name,

        count(
          distinct p.id
        ) participants,

        coalesce(
          sum(
            greatest(
              0,
              extract(
                epoch from (
                  least(
                    p.effective_left_at,
                    now()
                  )
                  -
                  greatest(
                    p.joined_at,
                    ${rangeConfig.start}
                  )
                )
              )
            )
          ) / 60,
          0
        ) minutes

      from scoped_rooms r

      left join scoped_participants p
        on p.room_id = r.id

      group by
        r.id,
        r.name

      order by minutes desc

      limit 10
    `)

  return {
    summary: {
      peakConcurrent: numeric(
        summaryRow?.peakConcurrent,
      ),

      totalSessions: numeric(
        summaryRow?.totalSessions,
      ),

      averageSessionSeconds: numeric(
        summaryRow?.averageSessionSeconds,
      ),

      participantSeconds: numeric(
        summaryRow?.participantSeconds,
      ),

      connectionSuccessRate: numeric(
        summaryRow?.connectionSuccessRate,
      ),
    },

    network: {
      sfuIngress: numeric(
        networkRow?.sfuIngress,
      ),

      sfuEgress: numeric(
        networkRow?.sfuEgress,
      ),

      turnIngress: numeric(
        networkRow?.turnIngress,
      ),

      turnEgress: numeric(
        networkRow?.turnEgress,
      ),
    },

    traffic: trafficResult.map(
      (value) => {
        const row =
          value as Record<
            string,
            unknown
          >

        return {
          label: String(
            row.label,
          ),

          participants:
            numeric(
              row.participants,
            ),

          sessions: numeric(
            row.sessions,
          ),
        }
      },
    ),

    networkSeries:
      networkSeriesResult.map(
        (value) => {
          const row =
            value as Record<
              string,
              unknown
            >

          return {
            label: String(
              row.label,
            ),

            sfuIngress:
              numeric(
                row.sfuIngress,
              ) /
              1024 ** 3,

            sfuEgress:
              numeric(
                row.sfuEgress,
              ) /
              1024 ** 3,

            turnIngress:
              numeric(
                row.turnIngress,
              ) /
              1024 ** 3,

            turnEgress:
              numeric(
                row.turnEgress,
              ) /
              1024 ** 3,
          }
        },
      ),

    quality: qualityResult.map(
      (value) => {
        const row =
          value as Record<
            string,
            unknown
          >

        return {
          label: String(
            row.label,
          ),

          rtt: numeric(
            row.rtt,
          ),

          jitter: numeric(
            row.jitter,
          ),

          packetLoss:
            numeric(
              row.packetLoss,
            ),
        }
      },
    ),

    regions: regionsResult.map(
      (value) => {
        const row =
          value as Record<
            string,
            unknown
          >

        return {
          name: String(
            row.name,
          ),

          sessions: numeric(
            row.sessions,
          ),
        }
      },
    ),

    qualityDistribution:
      qualityDistributionResult.map(
        (value) => {
          const row =
            value as Record<
              string,
              unknown
            >

          return {
            quality: String(
              row.quality,
            ),

            count: numeric(
              row.count,
            ),
          }
        },
      ),

    topRooms:
      topRoomsResult.map(
        (value) => {
          const row =
            value as Record<
              string,
              unknown
            >

          return {
            id: String(
              row.id,
            ),

            name: String(
              row.name,
            ),

            participants:
              numeric(
                row.participants,
              ),

            minutes: numeric(
              row.minutes,
            ),
          }
        },
      ),
  }
}
