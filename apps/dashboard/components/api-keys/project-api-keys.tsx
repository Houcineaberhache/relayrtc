import { ApiKeyRow, type ApiKeyView } from "@/components/api-keys/api-key-row"
import { CreateApiKeyForm } from "@/components/api-keys/create-api-key-form"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"

interface EnvironmentView {
  id: string
  name: string
  type: string
}

export function ProjectApiKeys({
  apiKeys,
  canManage,
  environments,
  projectId,
}: {
  apiKeys: readonly ApiKeyView[]
  canManage: boolean
  environments: readonly EnvironmentView[]
  projectId: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Keys are isolated by project and environment. Raw values are shown only once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {environments.map((environment) => {
          const environmentKeys = apiKeys.filter(
            (apiKey) => apiKey.environmentId === environment.id
          )

          return (
            <section key={environment.id} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{environment.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Keys created here cannot authenticate another environment.
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {environment.type}
                </Badge>
              </div>
              {environmentKeys.length > 0 ? (
                <div className="grid gap-4">
                  {environmentKeys.map((apiKey) => (
                    <ApiKeyRow key={apiKey.id} apiKey={apiKey} canManage={canManage} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No API keys have been created for this environment.
                </p>
              )}
              {canManage ? (
                <CreateApiKeyForm
                  environmentId={environment.id}
                  projectId={projectId}
                />
              ) : null}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
