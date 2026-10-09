"use server"

import { getAuthRuntime } from "@/lib/auth-server"
import { schema } from "@relayrtc/database"
import {
  authError,
  generateResourceSlug,
  getResourceDeletionImpact,
  getRuntimeOperation,
  toAuthError,
  transferOrganizationOwnership,
  type TransferOrganizationOwnershipResult,
} from "@relayrtc/auth"
import { createOrganizationInputSchema, deleteOrganizationInputSchema, organizationIdSchema, transferOrganizationOwnershipInputSchema } from "@relayrtc/validation"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

async function ownedOrganization(organizationId: string) {
  const runtime = getAuthRuntime()
  const session = await runtime.auth.api.getSession({ headers: await headers() })
  if (!session) return { error: authError("SESSION_REQUIRED"), organization: null, runtime }

  const [organization] = await runtime.database
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
  if (!organization) return { error: authError("ORGANIZATION_NOT_FOUND"), organization: null, runtime }

  const [membership] = await runtime.database
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(
      eq(schema.member.organizationId, organizationId),
      eq(schema.member.userId, session.user.id),
    ))
  if (!membership?.role.split(",").some((role) => role.trim() === "owner")) {
    return { error: authError("ORGANIZATION_DELETION_FORBIDDEN"), organization: null, runtime }
  }

  return { error: null, organization, runtime, userId: session.user.id }
}

export async function getOrganizationDeletionImpactAction(organizationId: unknown) {
  const validation = organizationIdSchema.safeParse(organizationId)
  if (!validation.success) return { data: null, error: authError("INVALID_REQUEST") }

  try {
    const owned = await ownedOrganization(validation.data)
    if (owned.error) return { data: null, error: owned.error }
    return {
      data: await getResourceDeletionImpact(owned.runtime.database, { organizationId: validation.data }),
      error: null,
    }
  } catch {
    return { data: null, error: authError("ORGANIZATION_DELETION_FAILED") }
  }
}

export async function deleteOrganizationAction(input: unknown) {
  const validation = deleteOrganizationInputSchema.safeParse(input)
  if (!validation.success) return { data: null, error: authError("INVALID_REQUEST") }

  try {
    const { organizationId, confirmationName } = validation.data
    const owned = await ownedOrganization(organizationId)
    if (owned.error) return { data: null, error: owned.error }
    if (confirmationName !== owned.organization.name) {
      return { data: null, error: authError("ORGANIZATION_CONFIRMATION_MISMATCH") }
    }

    const database = owned.runtime.database
    await database.transaction(async (transaction) => {
      const [organization] = await transaction
        .select({ name: schema.organization.name })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .for("update")
      if (organization?.name !== confirmationName) {
        throw new Error("Organization changed during deletion")
      }
      const [membership] = await transaction
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(and(
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.userId, owned.userId),
        ))
        .for("update")
      if (!membership?.role.split(",").some((role) => role.trim() === "owner")) {
        throw new Error("Organization owner changed during deletion")
      }
      await transaction.update(schema.organization).set({ status: "deleting", updatedAt: new Date() }).where(eq(schema.organization.id, organizationId))
    })

    revalidatePath("/", "layout")
    return { data: { organizationId, operation: await getRuntimeOperation(database, `organization.delete:${organizationId}`) }, error: null }
  } catch {
    return { data: null, error: authError("ORGANIZATION_DELETION_FAILED") }
  }
}

export async function createOrganizationAction(input: unknown) {
  const validation = createOrganizationInputSchema.safeParse(input)
  if (!validation.success) return { data: null, error: authError("INVALID_ORGANIZATION_NAME") }

  try {
    const runtime = getAuthRuntime()
    const organization = await runtime.auth.api.createOrganization({
      body: { name: validation.data.name, slug: generateResourceSlug(validation.data.name, "organization") },
      headers: await headers(),
    })
    revalidatePath("/", "layout")
    return { data: { id: organization.id }, error: null }
  } catch (error) {
    return { data: null, error: toAuthError(error) }
  }
}

export async function transferOrganizationOwnershipAction(
  input: unknown
): Promise<TransferOrganizationOwnershipResult> {
  const validation = transferOrganizationOwnershipInputSchema.safeParse(input)

  if (!validation.success) {
    return {
      data: null,
      error: authError("OWNERSHIP_TRANSFER_TARGET_INVALID"),
    }
  }

  const runtime = getAuthRuntime()
  const session = await runtime.auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return { data: null, error: authError("SESSION_REQUIRED") }
  }

  const result = await transferOrganizationOwnership({
    currentUserId: session.user.id,
    database: runtime.database,
    organizationId: validation.data.organizationId,
    targetMemberId: validation.data.targetMemberId,
  })

  if (result.data) revalidatePath("/", "layout")

  return result
}
