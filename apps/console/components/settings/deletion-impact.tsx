import type { ResourceDeletionImpact } from '@relayrtc/auth'

export function DeletionImpact({ impact, includeProjects = false }: {
  impact: ResourceDeletionImpact
  includeProjects?: boolean
}) {
  const rows = [
    ...(includeProjects ? [['Projects', impact.projects]] as const : []),
    ['Environments', impact.environments],
    ['API keys', impact.apiKeys],
    ['Rooms', impact.rooms],
    ['Rooms to terminate', impact.roomsToEnd],
    ['Connected participants to disconnect', impact.connectedParticipants],
  ] as const

  return (
    <div className="rounded-xl border bg-muted/40 px-4 py-2 text-sm">
      {rows.map(([label, count]) => (
        <div key={label} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
        </div>
      ))}
      <p className="border-t py-2 text-xs text-muted-foreground">
        Related participant records, usage data and analytics will also be deleted.
      </p>
    </div>
  )
}
