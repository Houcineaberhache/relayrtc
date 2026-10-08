import type { Metadata } from 'next'
import { PageHeader } from '@/components/page/page-header'
import { ProjectGeneral } from '@/components/settings/project-general'
import { requireProject } from '@/lib/console-data'

export const metadata: Metadata = { title: 'Project settings', description: 'Rename or delete this project.' }
export const dynamic = 'force-dynamic'

export default async function ProjectSettingsPage({ params }: { params: Promise<{ orgId: string; projectId: string }> }) {
  const { orgId, projectId } = await params
  const data = await requireProject(orgId, projectId)
  return <div className="flex flex-col gap-6"><PageHeader title="Project settings" description={`Configuration for ${data.project.name}.`} /><ProjectGeneral project={data.project} orgId={orgId} canManage={data.canManage} /></div>
}
