import type { RelayKitDatabase } from "@relayrtc/database"
import { sql } from "drizzle-orm"

export interface UsageSummary {
  audioParticipantSeconds: number
  averageIncomingBitrate: number
  averageJitter: number
  averageRoundTripTime: number
  packetsLost: number
  packetsReceived: number
  messagesIn: number
  messagesOut: number
  participantSeconds: number
  peakConcurrentParticipants: number
  peakConcurrentRooms: number
  roomSeconds: number
  roomsCreated: number
  sfuEgressBytes: number
  sfuIngressBytes: number
  signalingConnections: number
  signalingConnectionSeconds: number
  turnEgressBytes: number
  turnIngressBytes: number
  turnRelaySeconds: number
  turnSessions: number
  videoParticipantSeconds: number
}

type SummaryRow = Record<keyof UsageSummary, number | string | null>

const numeric = (value: number | string | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value)

export async function getOrganizationUsage(
  database: RelayKitDatabase,
  organizationId: string
): Promise<UsageSummary> {
  const result = await database.execute(sql<SummaryRow>`
    with scoped_rooms as (
      select r.* from room r join project p on p.id = r.project_id
      where p.organization_id = ${organizationId}
    ), scoped_participants as (
      select participant.* from participant join scoped_rooms r on r.id = participant.room_id
    ), scoped_sessions as (
      select s.* from participant_session s join scoped_participants p on p.id = s.participant_id
    ), usage_events as (
      select metric, coalesce(sum(value), 0) value from usage_event
      where organization_id = ${organizationId} group by metric
    ), participant_events as (
      select joined_at at, 1 delta from scoped_participants
      union all select coalesce(left_at, now()), -1 from scoped_participants
    ), participant_peak as (
      select coalesce(max(active), 0) value from (
        select sum(sum(delta)) over (order by at) active from participant_events group by at
      ) ranked
    ), room_events as (
      select coalesce(started_at, created_at) at, 1 delta from scoped_rooms
      union all select coalesce(ended_at, now()), -1 from scoped_rooms
    ), room_peak as (
      select coalesce(max(active), 0) value from (
        select sum(sum(delta)) over (order by at) active from room_events group by at
      ) ranked
    ), quality as (
      select coalesce(sum(q.incoming_bitrate_sum) / nullif(sum(q.bitrate_sample_count), 0), 0) bitrate,
        coalesce(sum(q.jitter_sum) / nullif(sum(q.jitter_sample_count), 0), 0) jitter,
        coalesce(sum(q.round_trip_time_sum) / nullif(sum(q.round_trip_time_sample_count), 0), 0) round_trip,
        coalesce(sum(q.packets_lost), 0) packets_lost,
        coalesce(sum(q.packets_received), 0) packets_received
      from rtc_quality_metric q join scoped_rooms r on r.id = q.room_id
    )
    select
      coalesce((select sum(extract(epoch from (coalesce(left_at, now()) - joined_at))) from scoped_participants), 0) "participantSeconds",
      coalesce((select sum(connection_seconds + case when connection_state = 'connected'
        then extract(epoch from (now() - coalesce(reconnected_at, joined_at))) else 0 end) from scoped_sessions), 0) "signalingConnectionSeconds",
      (select count(*) from scoped_sessions) "signalingConnections",
      coalesce((select sum(messages_in) from scoped_sessions), 0) "messagesIn",
      coalesce((select sum(messages_out) from scoped_sessions), 0) "messagesOut",
      (select count(*) from scoped_rooms) "roomsCreated",
      coalesce((select sum(extract(epoch from (coalesce(ended_at, now()) - coalesce(started_at, created_at)))) from scoped_rooms), 0) "roomSeconds",
      (select value from participant_peak) "peakConcurrentParticipants",
      (select value from room_peak) "peakConcurrentRooms",
      (select bitrate from quality) "averageIncomingBitrate",
      (select jitter from quality) "averageJitter",
      (select round_trip from quality) "averageRoundTripTime",
      (select packets_lost from quality) "packetsLost",
      (select packets_received from quality) "packetsReceived",
      coalesce((select value from usage_events where metric = 'audioParticipantSeconds'), 0) "audioParticipantSeconds",
      coalesce((select value from usage_events where metric = 'videoParticipantSeconds'), 0) "videoParticipantSeconds",
      coalesce((select value from usage_events where metric = 'sfuIngressBytes'), 0) "sfuIngressBytes",
      coalesce((select value from usage_events where metric = 'sfuEgressBytes'), 0) "sfuEgressBytes",
      coalesce((select value from usage_events where metric = 'turnIngressBytes'), 0) "turnIngressBytes",
      coalesce((select value from usage_events where metric = 'turnEgressBytes'), 0) "turnEgressBytes",
      coalesce((select value from usage_events where metric = 'turnRelaySeconds'), 0) "turnRelaySeconds",
      coalesce((select value from usage_events where metric = 'turnSessions'), 0) "turnSessions"
  `)
  const row = result[0] as SummaryRow | undefined
  const keys = [
    "participantSeconds",
    "audioParticipantSeconds",
    "videoParticipantSeconds",
    "sfuIngressBytes",
    "sfuEgressBytes",
    "turnIngressBytes",
    "turnEgressBytes",
    "turnRelaySeconds",
    "turnSessions",
    "signalingConnections",
    "signalingConnectionSeconds",
    "messagesIn",
    "messagesOut",
    "roomsCreated",
    "roomSeconds",
    "peakConcurrentRooms",
    "peakConcurrentParticipants",
    "averageIncomingBitrate",
    "averageJitter",
    "averageRoundTripTime",
    "packetsLost",
    "packetsReceived",
  ] as const
  return Object.fromEntries(
    keys.map((key) => [key, numeric(row?.[key])])
  ) as unknown as UsageSummary
}

export interface UsageBucket {
  bucket: Date
  participantSeconds: number
  roomsCreated: number
}

export interface EnvironmentUsage {
  environmentId: string
  environmentName: string
  participantSeconds: number
  projectId: string
  projectName: string
  roomsCreated: number
  sfuEgressBytes: number
  sfuIngressBytes: number
}

export async function getEnvironmentUsage(
  database: RelayKitDatabase,
  organizationId: string
): Promise<EnvironmentUsage[]> {
  const result = await database.execute(sql`
    select p.id "projectId", p.name "projectName", e.id "environmentId", e.name "environmentName",
      count(distinct r.id) "roomsCreated",
      coalesce(sum(extract(epoch from (coalesce(pa.left_at, now()) - pa.joined_at))), 0) "participantSeconds",
      coalesce((select sum(value) from usage_event ue where ue.environment_id = e.id and ue.metric = 'sfuIngressBytes'), 0) "sfuIngressBytes",
      coalesce((select sum(value) from usage_event ue where ue.environment_id = e.id and ue.metric = 'sfuEgressBytes'), 0) "sfuEgressBytes"
    from project p join environment e on e.project_id = p.id
    left join room r on r.environment_id = e.id
    left join participant pa on pa.room_id = r.id
    where p.organization_id = ${organizationId}
    group by p.id, p.name, e.id, e.name order by p.name, e.name
  `)
  return result.map((value) => {
    const row = value as Record<string, number | string>
    return {
      environmentId: String(row.environmentId),
      environmentName: String(row.environmentName),
      participantSeconds: numeric(row.participantSeconds),
      projectId: String(row.projectId),
      projectName: String(row.projectName),
      roomsCreated: numeric(row.roomsCreated),
      sfuEgressBytes: numeric(row.sfuEgressBytes),
      sfuIngressBytes: numeric(row.sfuIngressBytes),
    }
  })
}

export async function getOrganizationUsageBuckets(
  database: RelayKitDatabase,
  organizationId: string,
  granularity: "hour" | "day" | "month" = "day"
): Promise<UsageBucket[]> {
  const interval =
    granularity === "hour"
      ? "1 hour"
      : granularity === "month"
        ? "1 month"
        : "1 day"
  const count = granularity === "hour" ? 24 : granularity === "month" ? 12 : 14
  const result = await database.execute(sql<{
    bucket: Date
    participantSeconds: number | string
    roomsCreated: number | string
  }>`
    with buckets as (
      select generate_series(
        date_trunc(cast(${granularity} as text), now()) - (${count - 1} * cast(${interval} as interval)),
        date_trunc(cast(${granularity} as text), now()), cast(${interval} as interval)
      ) bucket
    ), scoped_rooms as (
      select r.* from room r join project p on p.id = r.project_id
      where p.organization_id = ${organizationId}
    )
    select b.bucket,
      coalesce(sum(greatest(0, extract(epoch from (
        least(coalesce(pa.left_at, now()), b.bucket + cast(${interval} as interval)) - greatest(pa.joined_at, b.bucket)
      )))), 0) "participantSeconds",
      (select count(*) from scoped_rooms r where r.created_at >= b.bucket and r.created_at < b.bucket + cast(${interval} as interval)) "roomsCreated"
    from buckets b left join participant pa on pa.room_id in (select id from scoped_rooms)
      and pa.joined_at < b.bucket + cast(${interval} as interval) and coalesce(pa.left_at, now()) >= b.bucket
    group by b.bucket order by b.bucket
  `)
  return result.map((value) => {
    const row = value as {
      bucket: Date | string
      participantSeconds: number | string
      roomsCreated: number | string
    }
    return {
      bucket: new Date(row.bucket),
      participantSeconds: numeric(row.participantSeconds),
      roomsCreated: numeric(row.roomsCreated),
    }
  })
}
