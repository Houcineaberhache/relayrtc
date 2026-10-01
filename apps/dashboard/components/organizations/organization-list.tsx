import { SwitchOrganizationButton } from "@/components/organizations/switch-organization-button"
import { Badge } from "@relayrtc/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { Building2 } from "lucide-react"

interface OrganizationSummary {
  id: string
  name: string
  slug: string
}

interface OrganizationListProps {
  activeOrganizationId?: string | null | undefined
  organizations: readonly OrganizationSummary[]
}

export function OrganizationList({
  activeOrganizationId,
  organizations,
}: OrganizationListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Organizations</CardTitle>
            <CardDescription>
              Choose the organization you want to work in.
            </CardDescription>
          </div>
          <Badge variant="secondary">{organizations.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {organizations.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
            <Building2 className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">No organizations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first organization below.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {organizations.map((organization) => {
              const active = organization.id === activeOrganizationId

              return (
                <div
                  key={organization.id}
                  className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {organization.name}
                        </p>
                        {active ? <Badge>Active</Badge> : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {organization.slug}
                      </p>
                    </div>
                  </div>
                  <SwitchOrganizationButton
                    active={active}
                    organizationId={organization.id}
                  />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
