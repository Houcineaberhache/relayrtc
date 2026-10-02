import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DeleteProjectForm } from "@/components/projects/delete-project-form"
import { ProjectEnvironments } from "@/components/projects/project-environments"
import { ProjectSettingsForm } from "@/components/projects/project-settings-form"
import { getAuthRuntime } from "@/lib/auth-server"
import { getCurrentOrganizations, getCurrentSession } from "@/lib/auth-session"
import { getProjectDetails } from "@/lib/projects/project-service"
import { Badge } from "@relayrtc/ui/components/badge"
import { buttonVariants } from "@relayrtc/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { projectIdSchema } from "@relayrtc/validation"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const validation = projectIdSchema.safeParse(projectId)

  if (!validation.success) notFound()

  const session = await getCurrentSession()

  if (!session) {
    redirect(
      `/auth/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`
    )
  }

  const result = await getProjectDetails(
    { database: getAuthRuntime().database, userId: session.user.id },
    validation.data
  )

  if (!result.data) notFound()

  const { canManage, environments, project } = result.data
  const organizations = await getCurrentOrganizations()
  const organization = organizations.find(
    (candidate) => candidate.id === project.organizationId
  )

  return (
    <div className="min-h-svh bg-muted/30">
      <DashboardHeader activeOrganization={organization} user={session.user} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft />
            Back to dashboard
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {project.name}
            </h1>
            <Badge variant="secondary" className="capitalize">
              {project.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Manage project settings and environment isolation.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
            <CardDescription>
              Rename this project or update its organization-scoped slug.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <ProjectSettingsForm project={project} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Only organization owners and admins can change project settings.
              </p>
            )}
          </CardContent>
        </Card>

        <ProjectEnvironments
          canManage={canManage}
          environments={environments}
        />

        {canManage ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Delete project</CardTitle>
              <CardDescription>
                Permanently deletes this project and all project-owned environments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteProjectForm project={project} />
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  )
}
