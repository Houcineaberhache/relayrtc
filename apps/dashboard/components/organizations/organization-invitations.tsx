import { CancelInvitationButton } from "@/components/organizations/cancel-invitation-button"
import { InviteOrganizationMemberForm } from "@/components/organizations/invite-organization-member-form"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { MailPlus } from "lucide-react"

interface PendingInvitation {
  email: string
  expiresAt: Date | string
  id: string
  role: string
}

interface OrganizationInvitationsProps {
  canManage: boolean
  invitations: readonly PendingInvitation[]
  organization?: {
    id: string
    name: string
  } | undefined
}

const formatExpiration = (value: Date | string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value)
  )

export function OrganizationInvitations({
  canManage,
  invitations,
  organization,
}: OrganizationInvitationsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Invitations</CardTitle>
            <CardDescription>
              Invite teammates to the active organization through Resend.
            </CardDescription>
          </div>
          <Badge variant="secondary">{invitations.length} pending</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!organization ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
            <MailPlus className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Select an organization</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an active organization before inviting members.
              </p>
            </div>
          </div>
        ) : canManage ? (
          <>
            <InviteOrganizationMemberForm organizationId={organization.id} />
            {invitations.length > 0 ? (
              <div className="space-y-3 border-t pt-6">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between gap-4 rounded-xl border p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{invitation.email}</p>
                      <p className="text-sm capitalize text-muted-foreground">
                        {invitation.role} · Expires {formatExpiration(invitation.expiresAt)}
                      </p>
                    </div>
                    <CancelInvitationButton invitationId={invitation.id} />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only organization owners and admins can manage invitations.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
