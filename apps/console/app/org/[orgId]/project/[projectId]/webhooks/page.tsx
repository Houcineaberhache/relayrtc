import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listWebhookEndpointsAction } from '@/actions/webhooks'
import { WebhooksManager } from '@/components/project/webhooks-manager'
import { requireProject } from '@/lib/console-data'

export const metadata: Metadata = {
  title: 'Webhooks',
  description: 'Manage webhook endpoints, signing secrets and delivery history.',
}
export const dynamic = 'force-dynamic'

export default async function WebhooksPage({ params, searchParams }: {
  params: Promise<{ orgId: string; projectId: string }>
  searchParams: Promise<{ environmentId?: string }>
}) {
  const { orgId, projectId } = await params
  const { environmentId: requestedEnvironment } = await searchParams
  const data = await requireProject(orgId, projectId)
  const environments = data.environments.filter((environment) => environment.status === 'active')
  const environment = requestedEnvironment
    ? environments.find((candidate) => candidate.id === requestedEnvironment)
    : environments.find((candidate) => candidate.type === 'development') ?? environments[0]
  if (requestedEnvironment && !environment) notFound()
  const result = environment ? await listWebhookEndpointsAction({ projectId, environmentId: environment.id }) : null
  return <WebhooksManager
    key={environment?.id ?? 'no-environment'}
    projectId={projectId}
    environments={environments}
    environmentId={environment?.id ?? ''}
    endpoints={result?.data?.endpoints ?? []}
    initialError={result?.error ?? null}
    canManage={data.canManage}
  />
}
