import { OrganizationMemberActions } from "@/components/organizations/organization-member-actions"
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
import { UsersRound } from "lucide-react"

interface OrganizationMember {
  createdAt: Date | string
  id: string
  role: string
  userId: string
  user: {
    email: string
    image?: string | undefined
    name: string
  }
}

interface OrganizationMembersProps {
  currentRole?: string | undefined
  currentUserId: string
  members: readonly OrganizationMember[]
  organization?: {
    id: string
    name: string
  } | undefined
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

const memberSince = (value: Date | string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))

export function OrganizationMembers({
  currentRole,
  currentUserId,
  members,
  organization,
}: OrganizationMembersProps) {
  const currentRoles = currentRole?.split(",").map((role) => role.trim()) ?? []
  const isOwner = currentRoles.includes("owner")
  const isAdmin = currentRoles.includes("admin")
  const canManage = isOwner || isAdmin
  const ownerCount = members.filter((member) =>
    member.role.split(",").includes("owner")
  ).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Members</CardTitle>
            <CardDescription>
              View teammates and manage their organization access.
            </CardDescription>
          </div>
          <Badge variant="secondary">{members.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!organization ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
            <UsersRound className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Select an organization</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an active organization to view its members.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {members.map((member) => {
              const targetRoles = member.role.split(",")
              const targetIsOwner = targetRoles.includes("owner")
              const isCurrentUser = member.userId === currentUserId
              const canChange = isOwner || (isAdmin && !targetIsOwner)
              const allowedRoles = !canChange
                ? []
                : targetIsOwner && ownerCount === 1
                  ? (["owner"] as const)
                  : isOwner
                    ? (["owner", "admin", "developer", "viewer"] as const)
                    : (["admin", "developer", "viewer"] as const)
              const canRemove =
                canChange &&
                !isCurrentUser &&
                (!targetIsOwner || ownerCount > 1)

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar>
                      {member.user.image ? (
                        <AvatarImage
                          src={member.user.image}
                          alt={member.user.name}
                        />
                      ) : null}
                      <AvatarFallback>{initials(member.user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{member.user.name}</p>
                        {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
                        {!canChange ? (
                          <Badge variant="secondary" className="capitalize">
                            {member.role}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {member.user.email} · Joined {memberSince(member.createdAt)}
                      </p>
                    </div>
                  </div>
                  {canManage && canChange ? (
                    <OrganizationMemberActions
                      allowedRoles={allowedRoles}
                      canRemove={canRemove}
                      member={{
                        id: member.id,
                        name: member.user.name,
                        role: member.role,
                      }}
                      organizationId={organization.id}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
