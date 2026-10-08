import type { Metadata } from 'next'
import { ApiKeysManager } from '@/components/project/api-keys-manager'
import { listProjectApiKeys } from '@/lib/api-keys/api-key-service'
import { getAuthRuntime } from '@/lib/auth-server'
import { requireProject } from '@/lib/console-data'

export const metadata: Metadata = {
  title: 'API keys',
  description: 'Create and revoke API keys for this project.',
}

export const dynamic = 'force-dynamic'

export default async function ApiKeysPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; projectId: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { orgId, projectId } = await params
  const { new: shouldCreate } = await searchParams

  const data = await requireProject(orgId, projectId)

  const result = await listProjectApiKeys(
    {
      database: getAuthRuntime().database,
      userId: data.session.user.id,
    },
    projectId,
  )

  const apiKeys = (result.data ?? []).map((apiKey) => ({
    ...apiKey,
    createdAt: apiKey.createdAt.toISOString(),
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
  }))

  return (
    <ApiKeysManager
      projectId={projectId}
      environments={data.environments}
      apiKeys={apiKeys}
      canManage={data.canManage}
      defaultOpen={shouldCreate === '1'}
    />
  )
}