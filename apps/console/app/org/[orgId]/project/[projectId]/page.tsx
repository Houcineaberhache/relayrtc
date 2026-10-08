import { ArrowUpRight, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/page/page-header'
import { Panel } from '@/components/page/panel'
import { MiniBars, StatCard } from '@/components/page/stat-card'
import { QuickstartTabs } from '@/components/project/quickstart-tabs'
import { buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatNumber } from '@/lib/format'
import { requireProject } from '@/lib/console-data'
import { routes } from '@/lib/routes'
import { cn } from '@/lib/utils'
import {
  MONTHLY_FREE_MINUTES,
  getMonthToDateMinutes,
  getUsage,
} from '@/lib/usage-data'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>
}): Promise<Metadata> {
  const { orgId, projectId } = await params
  const data = await requireProject(orgId, projectId)

  return {
    title: data.project.name,
  }
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>
}) {
  const { orgId, projectId } = await params
  const data = await requireProject(orgId, projectId)

  const usage = getUsage({
    offset: 0,
    granularity: 'day',
    groupBy: 'media',
    environment: 'all',
  })

  const usedMinutes = getMonthToDateMinutes()

  const usedPercent = Math.min(
    Math.round((usedMinutes / MONTHLY_FREE_MINUTES) * 100),
    100,
  )

  const firstName =
    data.session.user.name?.trim().split(/\s+/)[0] || 'there'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${firstName}!`}
        description={`Manage and overview your Relayrtc projects.`}
        actions={
          <Link
            href={`${routes.projectPage(orgId, projectId, 'api-keys')}?new=1`}
            className={cn(
              buttonVariants({ size: 'lg' }),
              'rounded-full',
            )}
          >
            <Plus />
            Create API key
          </Link>
        }
      />

      <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium">Community plan</h2>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatNumber(usedMinutes)} of{' '}
            {formatNumber(MONTHLY_FREE_MINUTES)} free participant minutes used
            this month.
          </p>

          <Progress
            value={usedPercent}
            aria-label="Free participant minutes used"
            className="mt-3 max-w-md"
          />
        </div>

        <Link
          href={routes.orgSettings(orgId, 'billing')}
          className={cn(
            buttonVariants({ size: 'default' }),
            'w-full rounded-full sm:w-auto',
          )}
        >
          Upgrade plan
        </Link>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live participants"
          value="128"
          hint="now"
          delta={4.2}
        >
          <MiniBars
            label="Live participants over the last hour"
            values={[40, 52, 61, 58, 72, 80, 95, 88, 102, 110, 121, 128]}
          />
        </StatCard>

        <StatCard
          label="Participant minutes"
          value={formatNumber(usage.totals.minutes)}
          hint="7d"
          delta={8.1}
        >
          <MiniBars
            label="Participant minutes per day"
            values={usage.minutesByBucket.map((bucket) => bucket.value)}
          />
        </StatCard>

        <StatCard
          label="Sessions"
          value={formatNumber(usage.totals.sessions)}
          hint="7d"
          delta={5.6}
        >
          <MiniBars
            label="Sessions per day"
            values={usage.sessionsByBucket.map((bucket) => bucket.value)}
          />
        </StatCard>

        <StatCard
          label="Connection success"
          value="99.2%"
          hint="7d"
          delta={0.2}
        >
          <MiniBars
            label="Connection success per day"
            values={[97, 98, 99, 98, 99, 99, 99]}
          />
        </StatCard>
      </div>

      <Panel className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium">Start building</h2>

            <p className="mt-0.5 text-sm text-muted-foreground">
              Create an API key, mint a token on your server, then join a room
              from any client.
            </p>
          </div>

          <Link
            href={routes.projectPage(orgId, projectId, 'api-keys')}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'shrink-0 rounded-full',
            )}
          >
            API keys
            <ArrowUpRight />
          </Link>
        </div>

        <QuickstartTabs />
      </Panel>
    </div>
  )
}