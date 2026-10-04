import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { LiveRefresh } from "@/components/dashboard/live-refresh"
import { getAuthRuntime } from "@/lib/auth-server"
import { getCurrentOrganizations, getCurrentSession } from "@/lib/auth-session"
import {
  getPlatformTelemetry,
  getServiceStatuses,
} from "@/lib/usage/telemetry-service"
import { refreshUsageAggregates } from "@/lib/usage/usage-aggregation"
import {
  getOrganizationUsage,
  getOrganizationUsageBuckets,
  getEnvironmentUsage,
} from "@/lib/usage/usage-service"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import {
  Activity,
  Clock3,
  Gauge,
  Radio,
  Server,
  Users,
  Video,
} from "lucide-react"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const duration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue))
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}h ${minutes}m ${remainder}s`
    : `${minutes}m ${remainder}s`
}

const bytes = (value: number | null) => {
  if (value === null) return "Unavailable"
  return new Intl.NumberFormat("en", {
    notation: "compact",
    style: "unit",
    unit: "byte",
    unitDisplay: "narrow",
  }).format(value)
}

const number = (value: number) =>
  new Intl.NumberFormat("en").format(Math.floor(value))

export default async function OverviewPage() {
  const session = await getCurrentSession()
  if (!session) redirect("/auth/login?redirect=%2Fmetrics")
  const organizations = await getCurrentOrganizations()
  const activeOrganization = organizations.find(
    (organization) => organization.id === session.session.activeOrganizationId
  )
  if (!activeOrganization) redirect("/")

  const database = getAuthRuntime().database
  await refreshUsageAggregates(database, activeOrganization.id).catch(
    () => undefined
  )
  const [usage, buckets, environments, services, telemetry] = await Promise.all(
    [
      getOrganizationUsage(database, activeOrganization.id),
      getOrganizationUsageBuckets(database, activeOrganization.id),
      getEnvironmentUsage(database, activeOrganization.id),
      getServiceStatuses(),
      getPlatformTelemetry(),
    ]
  )
  const maxBucket = Math.max(
    1,
    ...buckets.map((bucket) => bucket.participantSeconds)
  )

  const metricCards = [
    {
      label: "Total participant time",
      value: duration(usage.participantSeconds),
      detail: `${number(usage.participantSeconds)} raw seconds`,
      icon: Users,
    },
    {
      label: "Audio participant time",
      value: duration(usage.audioParticipantSeconds),
      detail: "Published audio track time",
      icon: Radio,
    },
    {
      label: "Video participant time",
      value: duration(usage.videoParticipantSeconds),
      detail: "Published video track time",
      icon: Video,
    },
    {
      label: "Room time",
      value: duration(usage.roomSeconds),
      detail: `${number(usage.roomsCreated)} rooms created`,
      icon: Clock3,
    },
    {
      label: "SFU ingress",
      value: bytes(usage.sfuIngressBytes),
      detail: "Publisher traffic into RelayRTC",
      icon: Activity,
    },
    {
      label: "SFU egress",
      value: bytes(usage.sfuEgressBytes),
      detail: "Subscriber traffic from RelayRTC",
      icon: Activity,
    },
    {
      label: "Signaling time",
      value: duration(usage.signalingConnectionSeconds),
      detail: `${number(usage.signalingConnections)} connections`,
      icon: Server,
    },
    {
      label: "Signaling messages",
      value: number(usage.messagesIn + usage.messagesOut),
      detail: `${number(usage.messagesIn)} in · ${number(usage.messagesOut)} out`,
      icon: Gauge,
    },
  ]

  return (
    <div className="min-h-svh bg-muted/30">
      <LiveRefresh />
      <DashboardHeader
        activeOrganization={activeOrganization}
        user={session.user}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Badge variant="secondary">Usage &amp; metering</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Tenant-scoped usage totals, RTC quality, infrastructure telemetry,
            and service health.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{metric.label}</CardDescription>
                  <metric.icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metric.detail}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <Card>
            <CardHeader>
              <CardTitle>Participant time by day</CardTitle>
              <CardDescription>
                Exact partial-minute accounting for the last 14 UTC days.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex h-52 items-end gap-2">
              {buckets.map((bucket) => (
                <div
                  key={bucket.bucket.toISOString()}
                  className="flex h-full flex-1 flex-col justify-end gap-2"
                  title={`${bucket.bucket.toLocaleDateString()}: ${duration(bucket.participantSeconds)}`}
                >
                  <div
                    className="min-h-1 rounded-t bg-primary"
                    style={{
                      height: `${Math.max(2, (bucket.participantSeconds / maxBucket) * 100)}%`,
                    }}
                  />
                  <span className="truncate text-center text-[10px] text-muted-foreground">
                    {bucket.bucket.toLocaleDateString("en", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Concurrency</CardTitle>
              <CardDescription>Historical organization peaks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">Participants</p>
                <p className="text-3xl font-semibold">
                  {number(usage.peakConcurrentParticipants)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rooms</p>
                <p className="text-3xl font-semibold">
                  {number(usage.peakConcurrentRooms)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Average incoming bitrate
                </p>
                <p className="font-medium">
                  {bytes(usage.averageIncomingBitrate)}/s
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Avg. RTT</p>
                  <p className="font-medium">
                    {Math.round(usage.averageRoundTripTime * 1000)} ms
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg. jitter</p>
                  <p className="font-medium">
                    {Math.round(usage.averageJitter * 1000)} ms
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Packets received</p>
                  <p className="font-medium">{number(usage.packetsReceived)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Packets lost</p>
                  <p className="font-medium">{number(usage.packetsLost)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Service health</CardTitle>
              <CardDescription>
                Live readiness checks from the RelayRTC stack.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="font-medium">{service.name}</span>
                  <Badge
                    variant={
                      service.status === "healthy" ? "secondary" : "destructive"
                    }
                  >
                    {service.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>TURN usage &amp; platform sessions</CardTitle>
              <CardDescription>
                Live organization traffic is persisted from browser relay
                counters. Session activity comes from coturn.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Active sessions</p>
                <p className="text-xl font-semibold">
                  {telemetry.turnSessions === null
                    ? "Unavailable"
                    : number(telemetry.turnSessions)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Relay seconds/sec
                </p>
                <p className="text-xl font-semibold">
                  {telemetry.turnRelayRate === null
                    ? "Unavailable"
                    : number(telemetry.turnRelayRate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Organization ingress
                </p>
                <p className="text-xl font-semibold">
                  {bytes(usage.turnIngressBytes)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Organization egress
                </p>
                <p className="text-xl font-semibold">
                  {bytes(usage.turnEgressBytes)}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Usage by project and environment</CardTitle>
            <CardDescription>
              Tenant-scoped totals roll up from environment to project and
              organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-2xl text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium">Environment</th>
                  <th className="pb-3 text-right font-medium">
                    Participant time
                  </th>
                  <th className="pb-3 text-right font-medium">Rooms</th>
                  <th className="pb-3 text-right font-medium">SFU ingress</th>
                  <th className="pb-3 text-right font-medium">SFU egress</th>
                </tr>
              </thead>
              <tbody>
                {environments.map((environment) => (
                  <tr
                    className="border-b last:border-0"
                    key={environment.environmentId}
                  >
                    <td className="py-3 font-medium">
                      {environment.projectName}
                    </td>
                    <td className="py-3">{environment.environmentName}</td>
                    <td className="py-3 text-right">
                      {duration(environment.participantSeconds)}
                    </td>
                    <td className="py-3 text-right">
                      {number(environment.roomsCreated)}
                    </td>
                    <td className="py-3 text-right">
                      {bytes(environment.sfuIngressBytes)}
                    </td>
                    <td className="py-3 text-right">
                      {bytes(environment.sfuEgressBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
