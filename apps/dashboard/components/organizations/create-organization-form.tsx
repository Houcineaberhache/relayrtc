"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import { authError, toAuthError, type AuthError } from "@relayrtc/auth"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import {
  createOrganizationInputSchema,
  organizationSlugFromName,
} from "@relayrtc/validation"
import { CircleCheck, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function CreateOrganizationForm() {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [success, setSuccess] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    const validation = createOrganizationInputSchema.safeParse({ name, slug })

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
    const result = await authClient.organization.create(validation.data)

    if (result.error) {
      setError(toAuthError(result.error))
      setPending(false)
      return
    }

    setName("")
    setSlug("")
    setSlugEdited(false)
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
          Organization created successfully
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="organization-name">Organization name</Label>
          <Input
            id="organization-name"
            name="name"
            value={name}
            onChange={(event) => {
              const nextName = event.target.value
              setName(nextName)
              if (!slugEdited) setSlug(organizationSlugFromName(nextName))
            }}
            placeholder="Acme Inc."
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="organization-slug">Slug</Label>
          <Input
            id="organization-slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase())
              setSlugEdited(true)
            }}
            placeholder="acme-inc"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and hyphens only.
          </p>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Create organization
      </Button>
    </form>
  )
}
