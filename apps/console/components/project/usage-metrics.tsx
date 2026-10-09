import type { ProjectUsageResponse } from "@relayrtc/validation";
import { StatCard } from "@/components/page/stat-card";

export function UsageMetrics({
  summary,
  dataQuality,
}: Pick<ProjectUsageResponse, "summary" | "dataQuality">) {
  const number = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  const bytes = (value: number) => `${number(value / 1024 ** 3)} GiB`;
  const metrics: [string, string][] = [
    ["Participant minutes", number(summary.participantSeconds / 60)],
    ["Audio minutes", number(summary.audioParticipantSeconds / 60)],
    ["Video minutes", number(summary.videoParticipantSeconds / 60)],
    ["Screen share minutes", number(summary.screenShareSeconds / 60)],
    ["Rooms created", number(summary.roomsCreated)],
    ["Peak participants", number(summary.peakConcurrentParticipants)],
    ["Peak rooms", number(summary.peakConcurrentRooms)],
    ["Signaling connections", number(summary.signalingConnections)],
    ["Signaling connection minutes", number(summary.signalingConnectionSeconds / 60)],
    ["Messages in", number(summary.messagesIn)],
    ["Messages out", number(summary.messagesOut)],
    ["SFU ingress", bytes(summary.sfuIngressBytes)],
    ["SFU egress", bytes(summary.sfuEgressBytes)],
    ["TURN ingress", bytes(summary.turnIngressBytes)],
    ["TURN egress", bytes(summary.turnEgressBytes)],
    ["Screen share ingress", bytes(summary.screenShareIngressBytes)],
    ["Screen share egress", bytes(summary.screenShareEgressBytes)],
  ];
  return (
    <>
      {(dataQuality.sessionHistory === "partial" || dataQuality.messageHistory === "partial") && (
        <p role="status" className="text-sm text-muted-foreground">
          Some historical activity is unavailable. These totals may be incomplete.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <StatCard key={label} label={label} value={value} />
        ))}
      </div>
    </>
  );
}
