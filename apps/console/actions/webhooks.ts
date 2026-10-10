'use server'

import { revalidatePath } from 'next/cache'
import {
  createWebhookInputSchema, environmentIdSchema, listWebhookDeliveriesQuerySchema, projectIdSchema,
  replayWebhookDeliveryInputSchema, revealedWebhookConfigurationSchema, updateWebhookInputSchema,
  webhookConfigurationListSchema, webhookConfigurationSchema, webhookDeliveryDetailSchema,
  webhookDeliveryIdSchema, webhookDeliveryListSchema, webhookDeliveryRecordSchema, webhookEndpointIdSchema,
} from '@relayrtc/validation'
import { z } from 'zod'
import { requestWebhooks, WebhookApiError } from '@/lib/webhooks/client'
import { unavailableWebhookError, webhookSignatureInfoSchema, type WebhookResult } from '@/lib/webhooks/contracts'

const scopeSchema = z.object({ projectId: projectIdSchema, environmentId: environmentIdSchema }).strict()
const endpointSchema = scopeSchema.extend({ endpointId: webhookEndpointIdSchema })
const deliverySchema = endpointSchema.extend({ deliveryId: webhookDeliveryIdSchema })

async function perform<Input, Output>(inputSchema: z.ZodType<Input>, input: unknown, operation: (value: Input) => Promise<Output>, mutation = false): Promise<WebhookResult<Output>> {
  const validation = inputSchema.safeParse(input)
  if (!validation.success) return { data: null, error: { code: 'INVALID_WEBHOOK_INPUT', description: 'The webhook request contains invalid information.' } }
  try {
    const data = await operation(validation.data)
    if (mutation) revalidatePath('/org/[orgId]/project/[projectId]/webhooks', 'page')
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error instanceof WebhookApiError ? error.displayError : unavailableWebhookError }
  }
}

export async function listWebhookEndpointsAction(input: unknown) {
  return perform(scopeSchema, input, ({ projectId, environmentId }) =>
    requestWebhooks(projectId, environmentId, '', webhookConfigurationListSchema, { query: { limit: '100', offset: '0' } }))
}
export async function createWebhookEndpointAction(input: unknown) {
  return perform(scopeSchema.extend({ configuration: createWebhookInputSchema }), input,
    ({ projectId, environmentId, configuration }) => requestWebhooks(projectId, environmentId, '', revealedWebhookConfigurationSchema, { method: 'POST', body: configuration }), true)
}
export async function updateWebhookEndpointAction(input: unknown) {
  return perform(endpointSchema.extend({ configuration: updateWebhookInputSchema }), input,
    ({ projectId, environmentId, endpointId, configuration }) => requestWebhooks(projectId, environmentId, `/${encodeURIComponent(endpointId)}`, webhookConfigurationSchema, { method: 'PATCH', body: configuration }), true)
}
export async function rotateWebhookSecretAction(input: unknown) {
  return perform(endpointSchema, input, ({ projectId, environmentId, endpointId }) =>
    requestWebhooks(projectId, environmentId, `/${encodeURIComponent(endpointId)}/rotate-secret`, revealedWebhookConfigurationSchema, { method: 'POST', body: {} }), true)
}
export async function deleteWebhookEndpointAction(input: unknown) {
  return perform(endpointSchema, input, ({ projectId, environmentId, endpointId }) =>
    requestWebhooks(projectId, environmentId, `/${encodeURIComponent(endpointId)}`, z.null(), { method: 'DELETE' }), true)
}
export async function listWebhookDeliveriesAction(input: unknown) {
  return perform(endpointSchema.extend({ query: listWebhookDeliveriesQuerySchema.omit({ projectId: true, environmentId: true }) }), input,
    ({ projectId, environmentId, endpointId, query }) => requestWebhooks(projectId, environmentId, `/${encodeURIComponent(endpointId)}/deliveries`, webhookDeliveryListSchema, {
      query: { limit: String(query.limit), offset: String(query.offset), ...(query.status ? { status: query.status } : {}) },
    }))
}
export async function getWebhookDeliveryAction(input: unknown) {
  return perform(deliverySchema, input, ({ projectId, environmentId, endpointId, deliveryId }) =>
    requestWebhooks(projectId, environmentId, `/${encodeURIComponent(endpointId)}/deliveries/${encodeURIComponent(deliveryId)}`, webhookDeliveryDetailSchema))
}
export async function replayWebhookDeliveryAction(input: unknown) {
  return perform(deliverySchema.extend({ replay: replayWebhookDeliveryInputSchema }), input,
    ({ projectId, environmentId, endpointId, deliveryId, replay }) => requestWebhooks(projectId, environmentId,
      `/${encodeURIComponent(endpointId)}/deliveries/${encodeURIComponent(deliveryId)}/replay`, webhookDeliveryRecordSchema, { method: 'POST', body: replay }), true)
}
export async function getWebhookSignatureInfoAction(input: unknown) {
  return perform(scopeSchema, input, ({ projectId, environmentId }) =>
    requestWebhooks(projectId, environmentId, '/signature-contract', webhookSignatureInfoSchema))
}
