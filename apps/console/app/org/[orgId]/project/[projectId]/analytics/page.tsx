import type { Metadata } from 'next'
import { AnalyticsDashboard } from '@/components/project/analytics-dashboard'
import { PageHeader } from '@/components/page/page-header'
import {
  type AnalyticsRange,
  getProjectAnalytics,
} from '@/lib/analytics/project-analytics-service'
import { getAuthRuntime } from '@/lib/auth-server'
import { requireProject } from '@/lib/console-data'

export const metadata: Metadata = {
  title: 'Analytics',
  description:
    'Realtime traffic, connection quality and audience insights.',
}

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    orgId: string
    projectId: string
  }>

  searchParams: Promise<{
    range?: string
    environment?: string
  }>
}) {
  const { orgId, projectId } =
    await params

  const query = await searchParams

  const projectData =
    await requireProject(
      orgId,
      projectId,
    )

  const range: AnalyticsRange =
    query.range === 'live' ||
    query.range === '24h' ||
    query.range === '30d'
      ? query.range
      : '7d'

  const requestedEnvironment =
    query.environment ?? 'all'

  const selectedEnvironment =
    requestedEnvironment ===
      'all' ||
    projectData.environments.some(
      (environment) =>
        environment.id ===
        requestedEnvironment,
    )
      ? requestedEnvironment
      : 'all'

  const analytics =
    await getProjectAnalytics(
      getAuthRuntime().database,
      projectId,
      range,
      selectedEnvironment ===
        'all'
        ? null
        : selectedEnvironment,
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Live traffic, connection quality and detailed RTC activity for this project."
      />

      <AnalyticsDashboard
        range={range}
        environment={
          selectedEnvironment
        }
        environments={
          projectData.environments
        }
        data={analytics}
      />
    </div>
  )
}