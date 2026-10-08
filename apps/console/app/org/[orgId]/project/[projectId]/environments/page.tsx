import type { Metadata } from 'next'
import { EnvironmentsManager } from '@/components/project/environments-manager'
import { requireProject } from '@/lib/console-data'

export const metadata: Metadata = {
  title: 'Environments',
  description: 'Manage staging, preview and custom environments.',
}

export const dynamic = 'force-dynamic'

export default async function EnvironmentsPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>
}) {
  const { orgId, projectId } = await params

  const data = await requireProject(orgId, projectId)

  return (
    <EnvironmentsManager
      projectId={projectId}
      environments={data.environments}
      canManage={data.canManage}
    />
  )
}
