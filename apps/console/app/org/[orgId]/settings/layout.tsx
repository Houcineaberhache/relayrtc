import { SettingsShell } from '@/components/shell/settings-shell'
import { getOrganizationProjects, requireOrganization } from '@/lib/console-data'
import { routes } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const data = await requireOrganization(orgId)
  const projects = await getOrganizationProjects(orgId, data.session.user.id)
  const backHref = projects[0] ? routes.project(orgId, projects[0].id) : routes.org(orgId)
  return (
    <SettingsShell orgId={orgId} backHref={backHref} organizations={data.organizations} user={{ id: data.session.user.id, name: data.session.user.name, email: data.session.user.email, image: data.session.user.image }}>
      {children}
    </SettingsShell>
  )
}
