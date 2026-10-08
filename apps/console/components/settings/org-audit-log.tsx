import { PageHeader } from '@/components/page/page-header'
import { currentUser } from '@/lib/mock-data'

const events = [
  { id: 'evt_1', action: 'Created API key "Staging server"', time: 'Oct 3, 2026 · 14:22' },
  { id: 'evt_2', action: 'Created environment "Preview"', time: 'Oct 3, 2026 · 09:05' },
  { id: 'evt_3', action: 'Created API key "Chat Playground"', time: 'Oct 2, 2026 · 18:41' },
  { id: 'evt_4', action: 'Created project "Chat Playground"', time: 'Oct 2, 2026 · 18:40' },
  { id: 'evt_5', action: 'Created organization', time: 'Oct 2, 2026 · 18:38' },
]

export function OrgAuditLog() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="A record of sensitive actions taken in this organization." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-2 pb-3 font-normal">Event</th>
              <th scope="col" className="px-2 pb-3 font-normal">Actor</th>
              <th scope="col" className="px-2 pb-3 text-right font-normal">When</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b last:border-0">
                <td className="px-2 py-4 text-[0.9375rem]">{event.action}</td>
                <td className="px-2 py-4 text-muted-foreground">{currentUser.name}</td>
                <td className="px-2 py-4 text-right tabular-nums text-muted-foreground">{event.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
