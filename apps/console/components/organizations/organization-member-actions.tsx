"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import {
  authError,
  toOrganizationMemberError,
  type AuthError,
} from "@relayrtc/auth"
import { Button } from "@/components/ui/button"
import {
  removeOrganizationMemberInputSchema,
  updateOrganizationMemberRoleInputSchema,
} from "@relayrtc/validation"
import { LoaderCircle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

const roleLabels = {
  admin: "Admin",
  developer: "Developer",
  owner: "Owner",
  viewer: "Viewer",
} as const

type MemberRole = keyof typeof roleLabels

interface OrganizationMemberActionsProps {
  allowedRoles: readonly MemberRole[]
  canRemove: boolean
  member: {
    id: string
    name: string
    role: string
  }
  organizationId: string
}

export function OrganizationMemberActions({
  allowedRoles,
  canRemove,
  member,
  organizationId,
}: OrganizationMemberActionsProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [pendingAction, setPendingAction] = useState<"remove" | "update" | null>(
    null
  )
  const [role, setRole] = useState(member.role)

  const updateRole = async () => {
    setError(null)
    const validation = updateOrganizationMemberRoleInputSchema.safeParse({
      memberId: member.id,
      organizationId,
      role,
    })

    if (!validation.success) {
      setError(authError("INVALID_MEMBER_ROLE"))
      return
    }

    setPendingAction("update")
    const result = await authClient.organization.updateMemberRole(validation.data)

    if (result.error) {
      setError(toOrganizationMemberError(result.error, "update-role"))
      setPendingAction(null)
      return
    }

    setPendingAction(null)
    router.refresh()
  }

  const remove = async () => {
    if (!window.confirm(`Remove ${member.name} from this organization?`)) return

    setError(null)
    const validation = removeOrganizationMemberInputSchema.safeParse({
      memberIdOrEmail: member.id,
      organizationId,
    })

    if (!validation.success) {
      setError(authError("ORGANIZATION_MEMBER_NOT_FOUND"))
      return
    }

    setPendingAction("remove")
    const result = await authClient.organization.removeMember(validation.data)

    if (result.error) {
      setError(toOrganizationMemberError(result.error, "remove"))
      setPendingAction(null)
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Role for ${member.name}`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
          disabled={pendingAction !== null || allowedRoles.length < 2}
          className="h-8 rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {allowedRoles.map((allowedRole) => (
            <option key={allowedRole} value={allowedRole}>
              {roleLabels[allowedRole]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendingAction !== null || role === member.role}
          onClick={updateRole}
        >
          {pendingAction === "update" ? (
            <LoaderCircle className="animate-spin" />
          ) : null}
          Save role
        </Button>
        {canRemove ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pendingAction !== null}
            onClick={remove}
          >
            {pendingAction === "remove" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            Remove
          </Button>
        ) : null}
      </div>
      <AuthErrorMessage error={error} />
    </div>
  )
}
