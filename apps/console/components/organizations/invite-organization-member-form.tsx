"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import {
  authError,
  toOrganizationInvitationError,
  type AuthError,
} from "@relayrtc/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { inviteOrganizationMemberInputSchema } from "@relayrtc/validation"
import { CircleCheck, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

interface InviteOrganizationMemberFormProps {
  organizationId: string
}

export function InviteOrganizationMemberForm({
  organizationId,
}: InviteOrganizationMemberFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, setPending] = useState(false)
  const [role, setRole] = useState("developer")
  const [success, setSuccess] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    const validation = inviteOrganizationMemberInputSchema.safeParse({
      email,
      organizationId,
      role,
    })

    if (!validation.success) {
      setError(
        authError(
          validation.error.issues[0]?.path[0] === "email"
            ? "INVALID_INVITATION_EMAIL"
            : "INVALID_INVITATION_ROLE"
        )
      )
      return
    }

    setPending(true)
    const result = await authClient.organization.inviteMember(validation.data)

    if (result.error) {
      setError(toOrganizationInvitationError(result.error, "send"))
      setPending(false)
      return
    }

    setEmail("")
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
          Invitation sent through Resend
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <div className="space-y-2">
          <Label htmlFor="invitation-email">Email address</Label>
          <Input
            id="invitation-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="developer@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invitation-role">Role</Label>
          <select
            id="invitation-role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-8 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Send invitation
      </Button>
    </form>
  )
}
