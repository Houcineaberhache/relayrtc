import { describe, expect, it } from "vitest";
import { projectAnalyticsResponseSchema } from "@relayrtc/validation";
import { analyticsView } from "./analytics-view";

const startedAt = "2026-10-08T12:00:00.000Z";
const endedAt = "2026-10-08T13:00:00.000Z";
const network = {
  sfuIngressBytes: 100,
  sfuEgressBytes: 200,
  turnIngressBytes: 300,
  turnEgressBytes: 400,
};
const data = projectAnalyticsResponseSchema.parse({
  scope: { organizationId: "org_test", projectId: "project_test", environmentId: null },
  window: { range: "24h", startedAt, endedAt, timezone: "UTC", endExclusive: true },
  summary: {
    peakConcurrent: 1,
    totalSessions: 1,
    averageSessionSeconds: 90,
    participantSeconds: 90,
    connectionSuccessRate: 100,
  },
  network,
  dataQuality: { sessionHistory: "partial", messageHistory: "complete" },
  qualityGranularitySeconds: 60,
  traffic: [{ startedAt, endedAt, participants: 1, sessions: 1, participantSeconds: 90 }],
  networkSeries: [{ startedAt, endedAt, ...network }],
  quality: [
    { startedAt, endedAt, roundTripTimeMs: 25, jitterMs: 3, packetLossPercent: 2, sampleCount: 1 },
  ],
  regions: [],
  qualityDistribution: [],
  topRooms: [{ id: "room", name: "Room", participants: 1, participantSeconds: 90 }],
});

describe("analytics presentation", () => {
  it("uses backend totals and converts seconds to minutes without rounding away activity", () => {
    const result = analyticsView(data);
    expect(result.summary).toEqual(data.summary);
    expect(result.topRooms[0]?.minutes).toBe(1.5);
    expect(result.traffic[0]).toMatchObject({
      participants: 1,
      participantSeconds: 90,
      label: "12:00",
    });
    expect(result.networkSeries[0]).toMatchObject({ sfuIngress: 100, turnEgress: 400 });
    expect(result.dataQuality.sessionHistory).toBe("partial");
  });
  it("preserves milliseconds and missing quality samples", () => {
    expect(analyticsView(data).quality[0]).toMatchObject({ rtt: 25, jitter: 3, packetLoss: 2 });
    expect(
      analyticsView({
        ...data,
        quality: [
          {
            startedAt,
            endedAt,
            roundTripTimeMs: null,
            jitterMs: null,
            packetLossPercent: null,
            sampleCount: 0,
          },
        ],
      }).quality[0],
    ).toMatchObject({ rtt: null, jitter: null, packetLoss: null, sampleCount: 0 });
  });
});
