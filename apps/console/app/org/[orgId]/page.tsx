import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { CreateProjectCard } from '@/components/project/create-project-card'
import { OrgSwitcher } from '@/components/shell/org-switcher'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { getOrganizationManagementData, getOrganizationProjects, requireOrganization } from '@/lib/console-data'
import { routes } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export default async function OrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const data = await requireOrganization(orgId)
  const [projects, management] = await Promise.all([
    getOrganizationProjects(orgId, data.session.user.id),
    getOrganizationManagementData(orgId, data.session.user.id),
  ])
  const firstProject = projects[0]
  if (firstProject) redirect(routes.project(orgId, firstProject.id))

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b px-4 sm:px-8"><Logo /><div className="flex items-center gap-3"><div className="w-56"><OrgSwitcher organizations={data.organizations} currentOrgId={orgId} /></div><ThemeToggle /></div></header>
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-12">{management.canManage ? <CreateProjectCard organizationId={orgId} organizationName={data.organization.name} /> : <div className="w-full max-w-lg rounded-2xl border bg-card p-6"><h1 className="text-2xl font-medium">No projects yet</h1><p className="mt-2 text-sm text-muted-foreground">An organization owner or admin needs to create the first project before you can enter the console.</p></div>}</main>
    </div>
  )
}
