import { getAuthRuntime } from "@/lib/auth-server"
import { headers } from "next/headers"

export const getCurrentSession = async () =>
  getAuthRuntime().auth.api.getSession({
    headers: await headers(),
  })

export const getCurrentOrganizations = async () =>
  getAuthRuntime().auth.api.listOrganizations({
    headers: await headers(),
  })

export const getActiveOrganizationRole = async () =>
  getAuthRuntime().auth.api.getActiveMemberRole({
    headers: await headers(),
  })

export const getCurrentOrganizationInvitations = async (
  organizationId: string
) =>
  getAuthRuntime().auth.api.listInvitations({
    headers: await headers(),
    query: { organizationId },
  })

export const getCurrentOrganizationMembers = async (organizationId: string) =>
  getAuthRuntime().auth.api.listMembers({
    headers: await headers(),
    query: { organizationId },
  })

export const getOrganizationInvitation = async (id: string) =>
  getAuthRuntime().auth.api.getInvitation({
    headers: await headers(),
    query: { id },
  })

export const getOrganizationInvitationManagement = async (
  organizationId: string
) => {
  const requestHeaders = await headers()
  const auth = getAuthRuntime().auth
  const membership = await auth.api.getActiveMemberRole({
    headers: requestHeaders,
  })
  const canManage = membership.role
    .split(",")
    .some((role) => role === "owner" || role === "admin")

  if (!canManage) {
    return { canManage, invitations: [] }
  }

  const invitations = await auth.api.listInvitations({
    headers: requestHeaders,
    query: { organizationId },
  })
  const now = Date.now()

  return {
    canManage,
    invitations: invitations.filter(
      (invitation) =>
        invitation.status === "pending" &&
        invitation.expiresAt.getTime() > now
    ),
  }
}
