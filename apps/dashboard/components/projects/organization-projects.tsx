import { CreateProjectForm } from "@/components/projects/create-project-form"
import type { ProjectRecord } from "@/lib/projects/project-service"
import { Badge } from "@relayrtc/ui/components/badge"
import { buttonVariants } from "@relayrtc/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { FolderKanban } from "lucide-react"
import Link from "next/link"

interface OrganizationProjectsProps {
  canManage: boolean
  organization?: {
    id: string
  } | undefined
  projects: readonly ProjectRecord[]
}

export function OrganizationProjects({
  canManage,
  organization,
  projects,
}: OrganizationProjectsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Isolated applications and their realtime environments.
            </CardDescription>
          </div>
          <Badge variant="secondary">{projects.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!organization ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
            <FolderKanban className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Select an organization</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an active organization before managing projects.
              </p>
            </div>
          </div>
        ) : (
          <>
            {projects.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <div key={project.id} className="space-y-4 rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {project.slug}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {project.status}
                      </Badge>
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open project
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No projects exist in this organization yet.
              </p>
            )}
            {canManage ? (
              <div className="border-t pt-6">
                <CreateProjectForm organizationId={organization.id} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only organization owners and admins can create projects.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
