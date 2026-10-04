export interface ServiceStatus {
  name: string
  status: "healthy" | "unavailable"
}

const fetchHealthy = async (
  name: string,
  url: string
): Promise<ServiceStatus> => {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    })
    return { name, status: response.ok ? "healthy" : "unavailable" }
  } catch {
    return { name, status: "unavailable" }
  }
}

export const getServiceStatuses = () =>
  Promise.all([
    fetchHealthy(
      "API",
      process.env.RELAYRTC_API_HEALTH_URL ?? "http://api:8080/ready"
    ),
    fetchHealthy(
      "Signaling",
      process.env.RELAYRTC_SIGNALING_HEALTH_URL ?? "http://signaling:8081/ready"
    ),
    fetchHealthy(
      "Media",
      process.env.RELAYRTC_MEDIA_HEALTH_URL ?? "http://media:8082/ready"
    ),
    fetchHealthy(
      "Prometheus",
      process.env.RELAYRTC_PROMETHEUS_HEALTH_URL ??
        "http://prometheus:9090/-/ready"
    ),
  ])

const prometheusValue = async (query: string): Promise<number | null> => {
  try {
    const base = process.env.RELAYRTC_PROMETHEUS_URL ?? "http://prometheus:9090"
    const response = await fetch(
      `${base}/api/v1/query?query=${encodeURIComponent(query)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(2_500),
      }
    )
    if (!response.ok) return null
    const payload = (await response.json()) as {
      data?: { result?: { value?: [number, string] }[] }
    }
    const value = payload.data?.result?.[0]?.value?.[1]
    return value === undefined ? null : Number(value)
  } catch {
    return null
  }
}

export async function getPlatformTelemetry() {
  const [turnSessions, turnIngressBytes, turnEgressBytes, turnRelayRate] =
    await Promise.all([
      prometheusValue("relayrtc_turn_sessions or vector(0)"),
      prometheusValue(
        "(sum(increase(turn_total_traffic_rcvb[30d])) or vector(0)) + (sum(increase(turn_total_traffic_peer_rcvb[30d])) or vector(0))"
      ),
      prometheusValue(
        "(sum(increase(turn_total_traffic_sentb[30d])) or vector(0)) + (sum(increase(turn_total_traffic_peer_sentb[30d])) or vector(0))"
      ),
      prometheusValue("relayrtc_turn_relay_seconds_per_second or vector(0)"),
    ])
  return { turnEgressBytes, turnIngressBytes, turnRelayRate, turnSessions }
}
