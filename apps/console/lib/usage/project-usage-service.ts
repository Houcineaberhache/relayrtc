import type { RelayKitDatabase } from '@relayrtc/database'
import { sql } from 'drizzle-orm'

export interface ProjectUsageSummary {
  participantSeconds: number
  audioParticipantSeconds: number
  videoParticipantSeconds: number
  sfuIngressBytes: number
  sfuEgressBytes: number
  turnIngressBytes: number
  turnEgressBytes: number
  roomsCreated: number
  peakConcurrentParticipants: number
  peakConcurrentRooms: number
  signalingConnections: number
  signalingConnectionSeconds: number
  messagesIn: number
  messagesOut: number
  averageIncomingBitrate: number
  averageJitter: number
  averageRoundTripTime: number
  packetsLost: number
  packetsReceived: number
}

export interface ProjectUsageBucket {
  bucket: Date
  participantSeconds: number
  roomsCreated: number
}

export interface ProjectEnvironmentUsage {
  environmentId: string
  environmentName: string
  participantSeconds: number
  roomsCreated: number
  sfuIngressBytes: number
  sfuEgressBytes: number
  turnIngressBytes: number
  turnEgressBytes: number
}

const numeric = (value: unknown) =>
  value === null || value === undefined ? 0 : Number(value)

export async function getProjectUsage(
  database: RelayKitDatabase,
  projectId: string,
): Promise<ProjectUsageSummary> {
  const result = await database.execute(sql`
    with scoped_rooms as (
      select *
      from room
      where project_id = ${projectId}
    ),

    scoped_participants as (
      select
        p.*,
        r.status as room_status,
        r.ended_at as room_ended_at,
        (
          select max(s.disconnected_at)
          from participant_session s
          where s.participant_id = p.id
            and s.connection_state in ('disconnected', 'failed')
        ) as session_disconnected_at,
        (
          select count(*)
          from participant_session s
          where s.participant_id = p.id
            and s.connection_state in ('connected', 'reconnecting')
        ) as active_sessions
      from participant p
      join scoped_rooms r
        on r.id = p.room_id
    ),

    normalized_participants as (
      select
        p.*,
        case
          when p.left_at is not null then p.left_at

          when p.room_ended_at is not null then p.room_ended_at

          when p.active_sessions > 0 then now()

          when p.session_disconnected_at is not null then p.session_disconnected_at

          else p.joined_at
        end as effective_left_at
      from scoped_participants p
    ),

    scoped_sessions as (
      select s.*
      from participant_session s
      join normalized_participants p
        on p.id = s.participant_id
    ),

    usage_events as (
      select
        metric,
        coalesce(sum(value), 0) value
      from usage_event
      where project_id = ${projectId}
      group by metric
    ),

    participant_events as (
      select
        joined_at as at,
        1 as delta
      from normalized_participants

      union all

      select
        effective_left_at as at,
        -1 as delta
      from normalized_participants
    ),

    participant_peak as (
      select coalesce(max(active), 0) value
      from (
        select
          sum(sum(delta)) over (order by at) active
        from participant_events
        group by at
      ) ranked
    ),

    room_events as (
      select
        coalesce(started_at, created_at) as at,
        1 as delta
      from scoped_rooms

      union all

      select
        case
          when ended_at is not null then ended_at
          when status = 'active' then now()
          else coalesce(started_at, created_at)
        end as at,
        -1 as delta
      from scoped_rooms
    ),

    room_peak as (
      select coalesce(max(active), 0) value
      from (
        select
          sum(sum(delta)) over (order by at) active
        from room_events
        group by at
      ) ranked
    ),

    quality as (
      select
        coalesce(
          sum(q.incoming_bitrate_sum) /
          nullif(sum(q.bitrate_sample_count), 0),
          0
        ) bitrate,

        coalesce(
          sum(q.jitter_sum) /
          nullif(sum(q.jitter_sample_count), 0),
          0
        ) jitter,

        coalesce(
          sum(q.round_trip_time_sum) /
          nullif(sum(q.round_trip_time_sample_count), 0),
          0
        ) round_trip,

        coalesce(sum(q.packets_lost), 0) packets_lost,
        coalesce(sum(q.packets_received), 0) packets_received

      from rtc_quality_metric q
      join scoped_rooms r
        on r.id = q.room_id
    )

    select
      coalesce(
        (
          select sum(
            greatest(
              0,
              extract(
                epoch from (
                  effective_left_at - joined_at
                )
              )
            )
          )
          from normalized_participants
        ),
        0
      ) "participantSeconds",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'audioParticipantSeconds'
        ),
        0
      ) "audioParticipantSeconds",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'videoParticipantSeconds'
        ),
        0
      ) "videoParticipantSeconds",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'sfuIngressBytes'
        ),
        0
      ) "sfuIngressBytes",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'sfuEgressBytes'
        ),
        0
      ) "sfuEgressBytes",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'turnIngressBytes'
        ),
        0
      ) "turnIngressBytes",

      coalesce(
        (
          select value
          from usage_events
          where metric = 'turnEgressBytes'
        ),
        0
      ) "turnEgressBytes",

      (
        select count(*)
        from scoped_rooms
      ) "roomsCreated",

      (
        select value
        from participant_peak
      ) "peakConcurrentParticipants",

      (
        select value
        from room_peak
      ) "peakConcurrentRooms",

      (
        select count(*)
        from scoped_sessions
      ) "signalingConnections",

      coalesce(
        (
          select sum(
            connection_seconds +
            case
              when connection_state in ('connected', 'reconnecting')
                then extract(
                  epoch from (
                    now() -
                    coalesce(
                      reconnected_at,
                      joined_at
                    )
                  )
                )
              else 0
            end
          )
          from scoped_sessions
        ),
        0
      ) "signalingConnectionSeconds",

      coalesce(
        (
          select sum(messages_in)
          from scoped_sessions
        ),
        0
      ) "messagesIn",

      coalesce(
        (
          select sum(messages_out)
          from scoped_sessions
        ),
        0
      ) "messagesOut",

      (
        select bitrate
        from quality
      ) "averageIncomingBitrate",

      (
        select jitter
        from quality
      ) "averageJitter",

      (
        select round_trip
        from quality
      ) "averageRoundTripTime",

      (
        select packets_lost
        from quality
      ) "packetsLost",

      (
        select packets_received
        from quality
      ) "packetsReceived"
  `)

  const row =
    result[0] as
      | Record<string, unknown>
      | undefined

  const keys = [
    'participantSeconds',
    'audioParticipantSeconds',
    'videoParticipantSeconds',
    'sfuIngressBytes',
    'sfuEgressBytes',
    'turnIngressBytes',
    'turnEgressBytes',
    'roomsCreated',
    'peakConcurrentParticipants',
    'peakConcurrentRooms',
    'signalingConnections',
    'signalingConnectionSeconds',
    'messagesIn',
    'messagesOut',
    'averageIncomingBitrate',
    'averageJitter',
    'averageRoundTripTime',
    'packetsLost',
    'packetsReceived',
  ] as const

  return Object.fromEntries(
    keys.map((key) => [
      key,
      numeric(row?.[key]),
    ]),
  ) as unknown as ProjectUsageSummary
}

export async function getProjectUsageBuckets(
  database: RelayKitDatabase,
  projectId: string,
): Promise<ProjectUsageBucket[]> {
  const result = await database.execute(sql`
    with buckets as (
      select generate_series(
        date_trunc('day', now()) - interval '13 days',
        date_trunc('day', now()),
        interval '1 day'
      ) bucket
    ),

    scoped_rooms as (
      select *
      from room
      where project_id = ${projectId}
    ),

    scoped_participants as (
      select
        p.*,
        r.status as room_status,
        r.ended_at as room_ended_at,
        (
          select max(s.disconnected_at)
          from participant_session s
          where s.participant_id = p.id
            and s.connection_state in ('disconnected', 'failed')
        ) as session_disconnected_at,
        (
          select count(*)
          from participant_session s
          where s.participant_id = p.id
            and s.connection_state in ('connected', 'reconnecting')
        ) as active_sessions
      from participant p
      join scoped_rooms r
        on r.id = p.room_id
    ),

    normalized_participants as (
      select
        p.*,
        case
          when p.left_at is not null then p.left_at

          when p.room_ended_at is not null then p.room_ended_at

          when p.active_sessions > 0 then now()

          when p.session_disconnected_at is not null then p.session_disconnected_at

          else p.joined_at
        end as effective_left_at
      from scoped_participants p
    )

    select
      b.bucket,

      coalesce(
        sum(
          greatest(
            0,
            extract(
              epoch from (
                least(
                  p.effective_left_at,
                  b.bucket + interval '1 day'
                ) -
                greatest(
                  p.joined_at,
                  b.bucket
                )
              )
            )
          )
        ),
        0
      ) "participantSeconds",

      (
        select count(*)
        from scoped_rooms r
        where r.created_at >= b.bucket
          and r.created_at <
            b.bucket + interval '1 day'
      ) "roomsCreated"

    from buckets b

    left join normalized_participants p
      on p.joined_at <
        b.bucket + interval '1 day'
      and p.effective_left_at >
        b.bucket

    group by b.bucket

    order by b.bucket
  `)

  return result.map((value) => {
    const row =
      value as Record<
        string,
        unknown
      >

    return {
      bucket: new Date(
        String(row.bucket),
      ),

      participantSeconds: numeric(
        row.participantSeconds,
      ),

      roomsCreated: numeric(
        row.roomsCreated,
      ),
    }
  })
}

export async function getProjectEnvironmentUsage(
  database: RelayKitDatabase,
  projectId: string,
): Promise<ProjectEnvironmentUsage[]> {
  const result = await database.execute(sql`
    with normalized_participants as (
      select
        pa.*,
        r.environment_id,
        case
          when pa.left_at is not null
            then pa.left_at

          when r.ended_at is not null
            then r.ended_at

          when exists (
            select 1
            from participant_session s
            where s.participant_id = pa.id
              and s.connection_state in (
                'connected',
                'reconnecting'
              )
          )
            then now()

          else coalesce(
            (
              select max(s.disconnected_at)
              from participant_session s
              where s.participant_id = pa.id
            ),
            pa.joined_at
          )
        end as effective_left_at
      from participant pa
      join room r
        on r.id = pa.room_id
      where r.project_id = ${projectId}
    )

    select
      e.id "environmentId",
      e.name "environmentName",

      count(
        distinct r.id
      ) "roomsCreated",

      coalesce(
        (
          select sum(
            greatest(
              0,
              extract(
                epoch from (
                  np.effective_left_at -
                  np.joined_at
                )
              )
            )
          )
          from normalized_participants np
          where np.environment_id = e.id
        ),
        0
      ) "participantSeconds",

      coalesce(
        (
          select sum(value)
          from usage_event ue
          where ue.environment_id = e.id
            and ue.metric = 'sfuIngressBytes'
        ),
        0
      ) "sfuIngressBytes",

      coalesce(
        (
          select sum(value)
          from usage_event ue
          where ue.environment_id = e.id
            and ue.metric = 'sfuEgressBytes'
        ),
        0
      ) "sfuEgressBytes",

      coalesce(
        (
          select sum(value)
          from usage_event ue
          where ue.environment_id = e.id
            and ue.metric = 'turnIngressBytes'
        ),
        0
      ) "turnIngressBytes",

      coalesce(
        (
          select sum(value)
          from usage_event ue
          where ue.environment_id = e.id
            and ue.metric = 'turnEgressBytes'
        ),
        0
      ) "turnEgressBytes"

    from environment e

    left join room r
      on r.environment_id = e.id

    where e.project_id = ${projectId}

    group by
      e.id,
      e.name

    order by
      e.created_at
  `)

  return result.map((value) => {
    const row =
      value as Record<
        string,
        unknown
      >

    return {
      environmentId: String(
        row.environmentId,
      ),

      environmentName: String(
        row.environmentName,
      ),

      participantSeconds: numeric(
        row.participantSeconds,
      ),

      roomsCreated: numeric(
        row.roomsCreated,
      ),

      sfuIngressBytes: numeric(
        row.sfuIngressBytes,
      ),

      sfuEgressBytes: numeric(
        row.sfuEgressBytes,
      ),

      turnIngressBytes: numeric(
        row.turnIngressBytes,
      ),

      turnEgressBytes: numeric(
        row.turnEgressBytes,
      ),
    }
  })
}