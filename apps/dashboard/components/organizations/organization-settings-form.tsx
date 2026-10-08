"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import {
  authError,
  toOrganizationUpdateError,
  type AuthError,
} from "@relayrtc/auth"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { updateOrganizationInputSchema } from "@relayrtc/validation"
import { CircleCheck, Copy, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

interface OrganizationSettingsFormProps {
  organization: {
    id: string
    name: string
    slug: string
  }
}

export function OrganizationSettingsForm({
  organization,
}: OrganizationSettingsFormProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [name, setName] = useState(organization.name)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const unchanged = name === organization.name

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    const validation = updateOrganizationInputSchema.safeParse({
      organizationId: organization.id,
      name,
    })

    if (!validation.success) {
      setError(
        authError(
          validation.error.issues[0]?.path[0] === "name"
            ? "INVALID_ORGANIZATION_NAME"
            : "INVALID_ORGANIZATION_SLUG"
        )
      )
      return
    }

    setPending(true)
    const result = await authClient.organization.update({
      data: {
        name: validation.data.name,
      },
      organizationId: validation.data.organizationId,
    })

    if (result.error) {
      setError(toOrganizationUpdateError(result.error))
      setPending(false)
      return
    }

    setName(validation.data.name)
    setSuccess(true)
    setPending(false)
    router.refresh()
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <AuthErrorMessage error={error} />
      {success ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          role="status"
        >
          <CircleCheck className="size-4" />
          Organization settings updated
        </div>
      ) : null}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="organization-settings-name">Organization name</Label>
          <Input
            id="organization-settings-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <p>Organization ID</p>
        <div className="flex items-center gap-2"><code className="break-all">{organization.id}</code><Button type="button" variant="ghost" aria-label="Copy organization ID" onClick={() => void navigator.clipboard.writeText(organization.id)}><Copy className="size-4" /></Button></div>
        <p>Slug</p>
        <div className="flex items-center gap-2"><code className="break-all">{organization.slug}</code><Button type="button" variant="ghost" aria-label="Copy organization slug" onClick={() => void navigator.clipboard.writeText(organization.slug)}><Copy className="size-4" /></Button></div>
      </div>
      <Button type="submit" className="w-full" disabled={pending || unchanged}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Save changes
      </Button>
    </form>
  )
}
