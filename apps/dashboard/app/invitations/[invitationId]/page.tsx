import { AuthShell } from "@/components/auth/auth-shell"
import { InvitationResponse } from "@/components/organizations/invitation-response"
import {
  getCurrentSession,
  getOrganizationInvitation,
} from "@/lib/auth-session"
import { Badge } from "@relayrtc/ui/components/badge"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  const { invitationId } = await params
  const session = await getCurrentSession()

  if (!session) {
    redirect(
      `/auth/login?redirect=${encodeURIComponent(`/invitations/${invitationId}`)}`
    )
  }

  let invitation

  try {
    invitation = await getOrganizationInvitation(invitationId)
  } catch {
    invitation = null
  }

  if (!invitation) {
    return (
      <AuthShell
        title="Invitation unavailable"
        description="This invitation is invalid, expired, or no longer available."
      >
        <p className="text-center text-sm text-muted-foreground">
          Ask an organization owner or admin to send a new invitation.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={`Join ${invitation.organizationName}`}
      description={`${invitation.inviterEmail} invited ${session.user.email} to collaborate.`}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-xl bg-muted p-4">
          <span className="text-sm text-muted-foreground">Role</span>
          <Badge className="capitalize">{invitation.role}</Badge>
        </div>
        <InvitationResponse
          invitationId={invitation.id}
          organizationId={invitation.organizationId}
        />
      </div>
    </AuthShell>
  )
}
