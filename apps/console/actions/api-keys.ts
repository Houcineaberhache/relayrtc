"use server"

import { getAuthRuntime } from "@/lib/auth-server"
import { apiKeyError, type ApiKeyResult } from "@/lib/api-keys/api-key-errors"
import {
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from "@/lib/api-keys/api-key-service"
import {
  createApiKeyInputSchema,
  revokeApiKeyInputSchema,
  rotateApiKeyInputSchema,
} from "@relayrtc/validation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

const getContext = async () => {
  const runtime = getAuthRuntime()
  const session = await runtime.auth.api.getSession({ headers: await headers() })

  return session
    ? { database: runtime.database, userId: session.user.id }
    : null
}

const sessionRequired = <T>(): ApiKeyResult<T> => ({
  data: null,
  error: apiKeyError("API_KEY_ACCESS_DENIED"),
})

export async function createApiKeyAction(input: unknown) {
  const validation = createApiKeyInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: apiKeyError("INVALID_API_KEY_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await createApiKey(context, validation.data)
  if (result.data) revalidatePath("/", "layout")
  return result
}

export async function rotateApiKeyAction(input: unknown) {
  const validation = rotateApiKeyInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: apiKeyError("INVALID_API_KEY_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await rotateApiKey(context, validation.data)
  if (result.data) revalidatePath("/", "layout")
  return result
}

export async function revokeApiKeyAction(input: unknown) {
  const validation = revokeApiKeyInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: apiKeyError("INVALID_API_KEY_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await revokeApiKey(context, validation.data)
  if (result.data) revalidatePath("/", "layout")
  return result
}
