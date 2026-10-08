import { redirect } from 'next/navigation'
import { InvitationResponse } from '@/components/organizations/invitation-response'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { getCurrentSession, getOrganizationInvitation } from '@/lib/auth-session'

export const dynamic = 'force-dynamic'

export default async function InvitationPage({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params
  const session = await getCurrentSession()
  if (!session) redirect(`/auth/login?redirect=${encodeURIComponent(`/invitations/${invitationId}`)}`)
  let invitation: Awaited<ReturnType<typeof getOrganizationInvitation>> | null = null
  try { invitation = await getOrganizationInvitation(invitationId) } catch { invitation = null }

  return (
    <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-8">
      <header className="flex items-center justify-between"><Logo /><ThemeToggle /></header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6">
          {!invitation ? <><h1 className="text-2xl font-medium">Invitation unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This invitation is invalid, expired, or no longer available. Ask an organization owner or admin to send a new one.</p></> : <><h1 className="text-2xl font-medium">Join {invitation.organizationName}</h1><p className="mt-2 text-sm text-muted-foreground">{invitation.inviterEmail} invited {session.user.email} to collaborate.</p><div className="my-6 flex items-center justify-between rounded-xl bg-muted p-4"><span className="text-sm text-muted-foreground">Role</span><Badge className="capitalize">{invitation.role}</Badge></div><InvitationResponse invitationId={invitation.id} organizationId={invitation.organizationId} /></>}
        </div>
      </main>
    </div>
  )
}
