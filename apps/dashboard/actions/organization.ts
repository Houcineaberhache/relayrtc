"use server"

import { getAuthRuntime } from "@/lib/auth-server"
import {
  authError,
  generateResourceSlug,
  toAuthError,
  transferOrganizationOwnership,
  type TransferOrganizationOwnershipResult,
} from "@relayrtc/auth"
import { createOrganizationInputSchema, transferOrganizationOwnershipInputSchema } from "@relayrtc/validation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

export async function createOrganizationAction(input: unknown) {
  const validation = createOrganizationInputSchema.safeParse(input)
  if (!validation.success) return { data: null, error: authError("INVALID_ORGANIZATION_NAME") }

  try {
    const runtime = getAuthRuntime()
    const organization = await runtime.auth.api.createOrganization({
      body: { name: validation.data.name, slug: generateResourceSlug(validation.data.name, "organization") },
      headers: await headers(),
    })
    revalidatePath("/")
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

  if (result.data) revalidatePath("/")

  return result
}
