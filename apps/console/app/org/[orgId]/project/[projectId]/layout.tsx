import { ProjectShell } from '@/components/shell/project-shell'
import { requireProject } from '@/lib/console-data'

export const dynamic = 'force-dynamic'

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string; projectId: string }> }) {
  const { orgId, projectId } = await params
  const data = await requireProject(orgId, projectId)
  return (
    <ProjectShell
      orgId={orgId}
      projectId={projectId}
      organizations={data.organizations}
      projects={data.projects}
      user={{ id: data.session.user.id, name: data.session.user.name, email: data.session.user.email, image: data.session.user.image }}
      canManageProjects={data.canManage}
    >
      {children}
    </ProjectShell>
  )
}
