import 'server-only'

import { headers } from 'next/headers'
import { z } from 'zod'
import { reportingOrigin, sessionCookie } from '@/lib/reporting/request'
import { unavailableWebhookError, type WebhookError } from './contracts'

const errorSchema = z.object({ code: z.string().min(1).max(100), description: z.string().min(1).max(600) })
export class WebhookApiError extends Error {
  constructor(readonly displayError: WebhookError, readonly status?: number) {
    super(displayError.description)
  }
}

export async function requestWebhooks<T>(projectId: string, environmentId: string, suffix: string, responseSchema: z.ZodType<T>, options: {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string>
} = {}): Promise<T> {
  try {
    const cookie = sessionCookie((await headers()).get('cookie') ?? '')
    if (!cookie) throw new WebhookApiError({ code: 'AUTHENTICATION_REQUIRED', description: 'Sign in again to access webhooks.' }, 401)
    const query = new URLSearchParams({ ...options.query, environmentId })
    const path = `/v1/projects/${encodeURIComponent(projectId)}/webhooks${suffix}`
    const url = new URL(`${path}?${query}`, reportingOrigin())
    if (url.pathname !== path) throw new WebhookApiError({ code: 'INVALID_WEBHOOK_INPUT', description: 'The webhook request contains an invalid identifier.' }, 400)
    const method = options.method ?? 'GET'
    const requestHeaders: Record<string, string> = { cookie, accept: 'application/json' }
    if (method !== 'GET') {
      const authUrl = process.env.BETTER_AUTH_URL
      if (!authUrl) throw new WebhookApiError(unavailableWebhookError)
      requestHeaders.origin = new URL(authUrl).origin
    }
    if (options.body !== undefined) requestHeaders['content-type'] = 'application/json'
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const error = errorSchema.safeParse(await response.json().catch(() => null))
      const displayError = error.success && response.status < 500 ? error.data
        : error.success && error.data.code === 'WEBHOOK_SIGNING_UNAVAILABLE'
          ? { code: error.data.code, description: 'Webhook signing is temporarily unavailable. Contact your project administrator.' }
          : unavailableWebhookError
      throw new WebhookApiError(displayError, response.status)
    }
    return responseSchema.parse(response.status === 204 ? null : await response.json())
  } catch (error) {
    if (error instanceof WebhookApiError) throw error
    throw new WebhookApiError(unavailableWebhookError)
  }
}
