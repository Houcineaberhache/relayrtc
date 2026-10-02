import { CreateEnvironmentForm } from "@/components/projects/create-environment-form"
import { EnvironmentSettingsForm } from "@/components/projects/environment-settings-form"
import type { EnvironmentRecord } from "@/lib/projects/project-service"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"

export function ProjectEnvironments({
  canManage,
  environments,
  projectId,
}: {
  canManage: boolean
  environments: readonly EnvironmentRecord[]
  projectId: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Environments</CardTitle>
            <CardDescription>
              Separate credentials and realtime resources by deployment stage.
            </CardDescription>
          </div>
          <Badge variant="secondary">{environments.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {environments.map((environment) =>
          canManage ? (
            <EnvironmentSettingsForm
              key={environment.id}
              environment={environment}
            />
          ) : (
            <div
              key={environment.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{environment.name}</p>
                <p className="text-sm text-muted-foreground">{environment.slug}</p>
                <code className="text-xs text-muted-foreground">{environment.id}</code>
              </div>
              <Badge variant="secondary" className="capitalize">
                {environment.type}
              </Badge>
            </div>
          )
        )}
        {canManage ? <CreateEnvironmentForm projectId={projectId} /> : null}
      </CardContent>
    </Card>
  )
}
