export type AnalyticsRange = '24h' | '7d' | '30d'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const NOW = Date.UTC(2026, 9, 4, 12)

function rand(seed: number) {
  const x = Math.sin(seed * 78.233 + 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const envScale: Record<string, number> = {
  all: 1,
  production: 0.58,
  staging: 0.2,
  preview: 0.13,
  dev: 0.09,
}

export type AnalyticsResult = {
  traffic: { label: string; concurrent: number; sessions: number }[]
  quality: { label: string; rtt: number; jitter: number; packetLoss: number }[]
  summary: {
    peakConcurrent: number
    totalSessions: number
    avgDurationSeconds: number
    successRate: number
    deltas: { peakConcurrent: number; totalSessions: number; avgDuration: number; successRate: number }
  }
  network: {
    series: { label: string; sfuIngress: number; sfuEgress: number; turnIngress: number; turnEgress: number }[]
    totals: { sfuIngress: number; sfuEgress: number; turnIngress: number; turnEgress: number }
    deltas: { sfuIngress: number; sfuEgress: number; turnIngress: number; turnEgress: number }
    turnRelayShare: number
  }
  regions: { name: string; sessions: number }[]
  platforms: { name: string; share: number }[]
  topRooms: { name: string; peak: number; minutes: number }[]
}

export function getAnalytics(range: AnalyticsRange, environment: string): AnalyticsResult {
  const scale = envScale[environment] ?? 1
  const hourly = range === '24h'
  const count = range === '24h' ? 24 : range === '7d' ? 7 : 30
  const step = hourly ? HOUR_MS : DAY_MS

  const traffic: AnalyticsResult['traffic'] = []
  const quality: AnalyticsResult['quality'] = []
  const networkSeries: AnalyticsResult['network']['series'] = []
  const networkTotals = { sfuIngress: 0, sfuEgress: 0, turnIngress: 0, turnEgress: 0 }

  for (let i = 0; i < count; i += 1) {
    const time = NOW - (count - 1 - i) * step
    const date = new Date(time)
    const label = hourly
      ? `${String(date.getUTCHours()).padStart(2, '0')}:00`
      : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(time)

    const hourCurve = hourly ? 0.45 + 0.55 * Math.sin(((date.getUTCHours() - 6) / 24) * Math.PI * 2) ** 2 : 1
    const weekday = date.getUTCDay()
    const weekFactor = !hourly && (weekday === 0 || weekday === 6) ? 0.6 : 1
    const noise = 0.8 + 0.4 * rand(time / HOUR_MS)
    const concurrent = Math.round((hourly ? 420 : 760) * hourCurve * weekFactor * noise * scale)
    const sessions = Math.round((hourly ? 180 : 3900) * hourCurve * weekFactor * noise * scale)

    traffic.push({ label, concurrent, sessions })

    const gbPerBucket = hourly ? 1 / 24 : 1
    const trafficNoise = (offset: number) => 0.85 + 0.3 * rand(time / HOUR_MS + offset)
    const sfuEgress = Number((150 * gbPerBucket * hourCurve * weekFactor * trafficNoise(11) * scale).toFixed(2))
    const sfuIngress = Number((38 * gbPerBucket * hourCurve * weekFactor * trafficNoise(12) * scale).toFixed(2))
    const turnEgress = Number((11 * gbPerBucket * hourCurve * weekFactor * trafficNoise(13) * scale).toFixed(2))
    const turnIngress = Number((9 * gbPerBucket * hourCurve * weekFactor * trafficNoise(14) * scale).toFixed(2))
    networkSeries.push({ label, sfuIngress, sfuEgress, turnIngress, turnEgress })
    networkTotals.sfuIngress += sfuIngress
    networkTotals.sfuEgress += sfuEgress
    networkTotals.turnIngress += turnIngress
    networkTotals.turnEgress += turnEgress
    quality.push({
      label,
      rtt: Math.round(62 + 26 * rand(time / HOUR_MS + 1)),
      jitter: Number((4 + 5 * rand(time / HOUR_MS + 2)).toFixed(1)),
      packetLoss: Number((0.2 + 0.9 * rand(time / HOUR_MS + 3)).toFixed(2)),
    })
  }

  const totalSessions = traffic.reduce((sum, point) => sum + point.sessions, 0)
  const peakConcurrent = Math.max(...traffic.map((point) => point.concurrent))

  const regionBase = [
    { name: 'Europe (Frankfurt)', weight: 0.34 },
    { name: 'US East (Virginia)', weight: 0.27 },
    { name: 'Asia Pacific (Singapore)', weight: 0.19 },
    { name: 'US West (Oregon)', weight: 0.12 },
    { name: 'South America (São Paulo)', weight: 0.08 },
  ]

  return {
    traffic,
    quality,
    summary: {
      peakConcurrent,
      totalSessions,
      avgDurationSeconds: 1480 + Math.round(rand(count) * 300),
      successRate: 99.2,
      deltas: { peakConcurrent: 12.4, totalSessions: 8.1, avgDuration: -2.3, successRate: 0.2 },
    },
    network: {
      series: networkSeries,
      totals: {
        sfuIngress: Number(networkTotals.sfuIngress.toFixed(1)),
        sfuEgress: Number(networkTotals.sfuEgress.toFixed(1)),
        turnIngress: Number(networkTotals.turnIngress.toFixed(1)),
        turnEgress: Number(networkTotals.turnEgress.toFixed(1)),
      },
      deltas: { sfuIngress: 9.7, sfuEgress: 11.2, turnIngress: -3.4, turnEgress: 4.6 },
      turnRelayShare: 7.4,
    },
    regions: regionBase.map((region) => ({
      name: region.name,
      sessions: Math.round(totalSessions * region.weight),
    })),
    platforms: [
      { name: 'Web', share: 54 },
      { name: 'iOS', share: 22 },
      { name: 'Android', share: 19 },
      { name: 'Server SDK', share: 5 },
    ],
    topRooms: [
      { name: 'weekly-standup', peak: 48, minutes: 14820 },
      { name: 'support-lobby', peak: 31, minutes: 11240 },
      { name: 'product-demo', peak: 112, minutes: 9710 },
      { name: 'study-group-7', peak: 24, minutes: 6330 },
      { name: 'town-hall', peak: 240, minutes: 5120 },
    ].map((room) => ({
      ...room,
      minutes: Math.round(room.minutes * (range === '24h' ? 0.14 : range === '7d' ? 1 : 4.2) * scale),
    })),
  }
}
