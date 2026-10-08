"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import {
  toOrganizationInvitationError,
  type AuthError,
} from "@relayrtc/auth"
import { Button } from "@/components/ui/button"
import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function CancelInvitationButton({
  invitationId,
}: {
  invitationId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, setPending] = useState(false)

  const cancel = async () => {
    setError(null)
    setPending(true)
    const result = await authClient.organization.cancelInvitation({
      invitationId,
    })

    if (result.error) {
      setError(toOrganizationInvitationError(result.error, "cancel"))
      setPending(false)
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={cancel}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Cancel
      </Button>
      <AuthErrorMessage error={error} />
    </div>
  )
}
