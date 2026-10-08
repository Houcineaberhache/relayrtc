"use client"

import { createOrganizationAction } from "@/actions/organization"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authError, type AuthError } from "@relayrtc/auth"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { createOrganizationInputSchema } from "@relayrtc/validation"
import { CircleCheck, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function CreateOrganizationForm() {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    const validation = createOrganizationInputSchema.safeParse({ name })

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
    const result = await createOrganizationAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    setName("")
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
              setName(event.target.value)
            }}
            placeholder="Acme Inc."
            maxLength={120}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Create organization
      </Button>
    </form>
  )
}
