import type { Metadata } from 'next'
import { PageHeader } from '@/components/page/page-header'
import { ProjectUsageDashboard } from '@/components/project/project-usage-dashboard'
import { getAuthRuntime } from '@/lib/auth-server'
import { requireProject } from '@/lib/console-data'
import {
  getProjectUsage,
  getProjectUsageBuckets,
} from '@/lib/usage/project-usage-service'

export const metadata: Metadata = {
  title: 'Usage',
  description: 'Participant minutes and network usage for this project.',
}

export const dynamic = 'force-dynamic'

export default async function UsagePage({
  params,
}: {
  params: Promise<{
    orgId: string
    projectId: string
  }>
}) {
  const { orgId, projectId } = await params

  await requireProject(orgId, projectId)

  const database = getAuthRuntime().database

  const [summary, buckets] = await Promise.all([
    getProjectUsage(database, projectId),
    getProjectUsageBuckets(database, projectId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        description="Participant minutes and network consumption for this project."
      />

      <ProjectUsageDashboard
        projectId={projectId}
        summary={summary}
        buckets={buckets.map((bucket) => ({
          ...bucket,
          bucket: bucket.bucket.toISOString(),
        }))}
      />
    </div>
  )
}