import { environments } from '@/lib/mock-data'

export type MediaKey = 'audio' | 'video' | 'screen' | 'recording'
export type NetworkService = 'sfu' | 'turn'
export type NetworkKey = 'sfuIngress' | 'sfuEgress' | 'turnIngress' | 'turnEgress'
export type BreakdownKey = MediaKey | NetworkService
export type UsageUnit = 'minutes' | 'GB'
export type Granularity = 'day' | 'week'
export type GroupBy = 'media' | 'environment'

export const mediaTypes: {
  key: MediaKey
  label: string
  rate: number
  baseMinutes: number
  rows: [string, string]
}[] = [
  { key: 'audio', label: 'Audio', rate: 0.0005, baseMinutes: 6200, rows: ['Published audio', 'Subscribed audio'] },
  { key: 'video', label: 'Video', rate: 0.003, baseMinutes: 3100, rows: ['Published video', 'Subscribed video'] },
  { key: 'screen', label: 'Screen share', rate: 0.004, baseMinutes: 720, rows: ['Published screen', 'Subscribed screen'] },
  { key: 'recording', label: 'Recording', rate: 0.01, baseMinutes: 310, rows: ['Composite recording', 'Track recording'] },
]

export const networkServices: { key: NetworkService; label: string }[] = [
  { key: 'sfu', label: 'SFU' },
  { key: 'turn', label: 'TURN' },
]

export const networkMetrics: {
  key: NetworkKey
  service: NetworkService
  direction: 'Ingress' | 'Egress'
  label: string
  rate: number
  baseGb: number
}[] = [
  { key: 'sfuIngress', service: 'sfu', direction: 'Ingress', label: 'SFU ingress', rate: 0.01, baseGb: 38 },
  { key: 'sfuEgress', service: 'sfu', direction: 'Egress', label: 'SFU egress', rate: 0.04, baseGb: 150 },
  { key: 'turnIngress', service: 'turn', direction: 'Ingress', label: 'TURN ingress', rate: 0.02, baseGb: 9 },
  { key: 'turnEgress', service: 'turn', direction: 'Egress', label: 'TURN egress', rate: 0.08, baseGb: 11 },
]

const envWeights: Record<string, number> = {
  production: 0.58,
  staging: 0.2,
  preview: 0.13,
  dev: 0.09,
}

const DAY_MS = 86_400_000
const BASE_END = Date.UTC(2026, 9, 4)

export const MONTHLY_FREE_MINUTES = 50_000

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function formatDay(ms: number, withYear = false) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(ms)
}

export type UsageRow = {
  date: string
  service: string
  metric: string
  environment: string
  quantity: number
  unit: UsageUnit
  spend: number
}

type Bucketed = { label: string; value: number }[]

export type UsageResult = {
  series: { key: string; label: string }[]
  points: Record<string, number | string>[]
  rangeLabel: string
  totals: { spend: number; minutes: number; sessions: number; networkGb: number }
  minutesByBucket: Bucketed
  sessionsByBucket: Bucketed
  network: Record<NetworkKey, { gb: number; spend: number; byBucket: Bucketed }>
  breakdown: Record<
    BreakdownKey,
    { unit: UsageUnit; rows: { label: string; quantity: number; spend: number }[]; quantity: number; spend: number }
  >
  rows: UsageRow[]
}

export function getUsage(options: {
  offset: number
  granularity: Granularity
  groupBy: GroupBy
  environment: string
}): UsageResult {
  const { offset, granularity, groupBy, environment } = options
  const rangeDays = granularity === 'day' ? 7 : 28
  const bucketDays = granularity === 'day' ? 1 : 7
  const bucketCount = rangeDays / bucketDays
  const endMs = BASE_END - offset * rangeDays * DAY_MS
  const startMs = endMs - (rangeDays - 1) * DAY_MS
  const activeEnvs = environments.filter((env) => environment === 'all' || env.slug === environment)

  const series =
    groupBy === 'media'
      ? [
          ...mediaTypes.map((media) => ({ key: media.key as string, label: media.label })),
          ...networkServices.map((service) => ({ key: service.key as string, label: service.label })),
        ]
      : activeEnvs.map((env) => ({ key: env.slug, label: env.name }))

  const rows: UsageRow[] = []
  const points: Record<string, number | string>[] = []
  const minutesByBucket: Bucketed = []
  const sessionsByBucket: Bucketed = []

  const breakdown = {} as UsageResult['breakdown']
  mediaTypes.forEach((media) => {
    breakdown[media.key] = { unit: 'minutes', rows: [], quantity: 0, spend: 0 }
  })
  networkServices.forEach((service) => {
    breakdown[service.key] = { unit: 'GB', rows: [], quantity: 0, spend: 0 }
  })

  const network = Object.fromEntries(
    networkMetrics.map((metric) => [metric.key, { gb: 0, spend: 0, byBucket: [] }]),
  ) as unknown as UsageResult['network']

  let totalSpend = 0
  let totalMinutes = 0
  let totalSessions = 0
  let totalNetworkGb = 0

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = startMs + bucket * bucketDays * DAY_MS
    const label = formatDay(bucketStart)
    const point: Record<string, number | string> = { label }
    series.forEach((entry) => {
      point[entry.key] = 0
    })
    let bucketMinutes = 0
    let bucketSessions = 0
    const bucketGb: Record<NetworkKey, number> = {
      sfuIngress: 0,
      sfuEgress: 0,
      turnIngress: 0,
      turnEgress: 0,
    }

    for (let day = 0; day < bucketDays; day += 1) {
      const dayMs = bucketStart + day * DAY_MS
      const dayIndex = Math.floor(dayMs / DAY_MS)
      const weekday = new Date(dayMs).getUTCDay()
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.55 : 1

      mediaTypes.forEach((media, mediaIndex) => {
        activeEnvs.forEach((env) => {
          const envIndex = environments.findIndex((item) => item.slug === env.slug)
          const noise = 0.55 + 0.9 * rand(dayIndex * 13 + mediaIndex * 7 + envIndex * 3)
          const minutes = Math.round(media.baseMinutes * (envWeights[env.slug] ?? 0.1) * noise * weekendFactor)
          const spend = minutes * media.rate
          const key = groupBy === 'media' ? media.key : env.slug

          point[key] = Number(point[key]) + spend
          rows.push({
            date: formatDay(dayMs, true),
            service: media.key,
            metric: 'participant minutes',
            environment: env.slug,
            quantity: minutes,
            unit: 'minutes',
            spend,
          })
          bucketMinutes += minutes
          if (media.key !== 'recording') bucketSessions += minutes / 22
          totalSpend += spend
          totalMinutes += minutes

          const entry = breakdown[media.key]
          entry.quantity += minutes
          entry.spend += spend
        })
      })

      networkMetrics.forEach((metric, metricIndex) => {
        activeEnvs.forEach((env) => {
          const envIndex = environments.findIndex((item) => item.slug === env.slug)
          const noise = 0.6 + 0.8 * rand(dayIndex * 17 + 101 + metricIndex * 11 + envIndex * 5)
          const gb = Number((metric.baseGb * (envWeights[env.slug] ?? 0.1) * noise * weekendFactor).toFixed(2))
          const spend = gb * metric.rate
          const key = groupBy === 'media' ? metric.service : env.slug

          point[key] = Number(point[key]) + spend
          rows.push({
            date: formatDay(dayMs, true),
            service: metric.service,
            metric: `${metric.direction.toLowerCase()} traffic`,
            environment: env.slug,
            quantity: gb,
            unit: 'GB',
            spend,
          })
          bucketGb[metric.key] += gb
          totalSpend += spend
          totalNetworkGb += gb
          network[metric.key].gb += gb
          network[metric.key].spend += spend
        })
      })
    }

    series.forEach((entry) => {
      point[entry.key] = Number(Number(point[entry.key]).toFixed(2))
    })
    points.push(point)
    minutesByBucket.push({ label, value: bucketMinutes })
    sessionsByBucket.push({ label, value: Math.round(bucketSessions) })
    networkMetrics.forEach((metric) => {
      network[metric.key].byBucket.push({ label, value: Number(bucketGb[metric.key].toFixed(2)) })
    })
    totalSessions += Math.round(bucketSessions)
  }

  mediaTypes.forEach((media) => {
    const entry = breakdown[media.key]
    const publishedShare = media.key === 'recording' ? 0.7 : 0.38
    entry.rows = [
      { label: media.rows[0], quantity: Math.round(entry.quantity * publishedShare), spend: entry.spend * publishedShare },
      {
        label: media.rows[1],
        quantity: Math.round(entry.quantity * (1 - publishedShare)),
        spend: entry.spend * (1 - publishedShare),
      },
    ]
  })

  networkServices.forEach((service) => {
    const entry = breakdown[service.key]
    entry.rows = networkMetrics
      .filter((metric) => metric.service === service.key)
      .map((metric) => ({
        label: `${service.label} ${metric.direction.toLowerCase()}`,
        quantity: network[metric.key].gb,
        spend: network[metric.key].spend,
      }))
    entry.quantity = entry.rows.reduce((sum, row) => sum + row.quantity, 0)
    entry.spend = entry.rows.reduce((sum, row) => sum + row.spend, 0)
  })

  return {
    series,
    points,
    rangeLabel: `${formatDay(startMs, true)} – ${formatDay(endMs, true)}`,
    totals: { spend: totalSpend, minutes: totalMinutes, sessions: totalSessions, networkGb: totalNetworkGb },
    minutesByBucket,
    sessionsByBucket,
    network,
    breakdown,
    rows,
  }
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatGb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(2)} TB`
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : 1 })} GB`
}

export function getMonthToDateMinutes() {
  const { minutesByBucket } = getUsage({
    offset: 0,
    granularity: 'day',
    groupBy: 'media',
    environment: 'all',
  })
  return minutesByBucket.slice(-4).reduce((sum, bucket) => sum + bucket.value, 0)
}
