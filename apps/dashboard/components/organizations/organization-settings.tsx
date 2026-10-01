import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@relayrtc/ui/components/card"
import { Settings2 } from "lucide-react"

interface OrganizationSettingsProps {
  organization?: {
    id: string
    name: string
    slug: string
  } | undefined
}

export function OrganizationSettings({
  organization,
}: OrganizationSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization settings</CardTitle>
        <CardDescription>
          Rename the active organization or update its URL-friendly slug.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {organization ? (
          <OrganizationSettingsForm
            key={organization.id}
            organization={organization}
          />
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
            <Settings2 className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Select an organization</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an active organization before changing its settings.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
