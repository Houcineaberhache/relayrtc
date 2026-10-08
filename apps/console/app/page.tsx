import { redirect } from 'next/navigation'
import { getCurrentOrganizations, getCurrentSession } from '@/lib/auth-session'
import { getAuthRuntime } from '@/lib/auth-server'
import { listOrganizationProjects } from '@/lib/projects/project-service'
import { routes } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getCurrentSession()
  if (!session) redirect(routes.login)

  const organizations = await getCurrentOrganizations()
  if (organizations.length === 0) redirect(routes.onboarding)

  const active = organizations.find((org) => org.id === session.session.activeOrganizationId) ?? organizations[0]
  if (!active) redirect(routes.onboarding)

  const projects = await listOrganizationProjects(
    { database: getAuthRuntime().database, userId: session.user.id },
    active.id,
  )
  const firstProject = projects.data?.[0]
  if (!firstProject) redirect(routes.org(active.id))
  redirect(routes.project(active.id, firstProject.id))
}
