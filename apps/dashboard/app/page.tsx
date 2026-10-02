import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { CreateOrganizationForm } from "@/components/organizations/create-organization-form"
import { OrganizationList } from "@/components/organizations/organization-list"
import { OrganizationInvitations } from "@/components/organizations/organization-invitations"
import { OrganizationMembers } from "@/components/organizations/organization-members"
import { OrganizationSettings } from "@/components/organizations/organization-settings"
import {
  getActiveOrganizationRole,
  getCurrentOrganizations,
  getCurrentOrganizationMembers,
  getCurrentSession,
  getOrganizationInvitationManagement,
} from "@/lib/auth-session"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@relayrtc/ui/components/avatar"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { Separator } from "@relayrtc/ui/components/separator"
import { CalendarClock, FolderKanban, Mail, UserRound } from "lucide-react"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

export default async function Page() {
  const session = await getCurrentSession()

  if (!session) {
    redirect("/auth/login?redirect=%2F")
  }

  const organizations = await getCurrentOrganizations()
  const activeOrganization = organizations.find(
    (organization) => organization.id === session.session.activeOrganizationId
  )
  const [memberManagement, currentRole] = activeOrganization
    ? await Promise.all([
        getCurrentOrganizationMembers(activeOrganization.id),
        getActiveOrganizationRole(),
      ])
    : [{ members: [], total: 0 }, undefined]
  const invitationManagement = activeOrganization
    ? await getOrganizationInvitationManagement(activeOrganization.id)
    : { canManage: false, invitations: [] }

  return (
    <div className="min-h-svh bg-muted/30">
      <DashboardHeader
        activeOrganization={activeOrganization}
        user={session.user}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Badge variant="secondary">Dashboard</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Hello, {session.user.name}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Create an organization to establish the workspace for your team
            and projects.
          </p>
        </div>

        <OrganizationList
          activeOrganizationId={session.session.activeOrganizationId}
          organizations={organizations}
        />

        <OrganizationSettings organization={activeOrganization} />

        <OrganizationMembers
          currentRole={currentRole?.role}
          currentUserId={session.user.id}
          members={memberManagement.members}
          organization={activeOrganization}
        />

        <OrganizationInvitations
          canManage={invitationManagement.canManage}
          invitations={invitationManagement.invitations}
          organization={activeOrganization}
        />

        <Card>
          <CardHeader>
            <CardTitle>Create an organization</CardTitle>
            <CardDescription>
              Organizations contain members, projects, and their realtime
              infrastructure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrganizationForm />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Your authenticated profile information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar size="lg">
                  {session.user.image ? (
                    <AvatarImage
                      src={session.user.image}
                      alt={session.user.name}
                    />
                  ) : null}
                  <AvatarFallback>{initials(session.user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{session.user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <Separator />
              <dl className="grid gap-5 sm:grid-cols-2">
                <div className="flex gap-3">
                  <UserRound className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-sm text-muted-foreground">Name</dt>
                    <dd className="font-medium">{session.user.name}</dd>
                  </div>
                </div>
                <div className="flex min-w-0 gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-sm text-muted-foreground">Email</dt>
                    <dd className="truncate font-medium">
                      {session.user.email}
                    </dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <CardDescription>
                Your current secure dashboard session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {formatDate(session.session.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Expires</p>
                  <p className="font-medium">
                    {formatDate(session.session.expiresAt)}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
                <FolderKanban className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">No projects yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Project creation arrives with organization management.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
