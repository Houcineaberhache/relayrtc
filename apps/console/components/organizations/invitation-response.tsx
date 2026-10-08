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

interface InvitationResponseProps {
  invitationId: string
  organizationId: string
}

export function InvitationResponse({
  invitationId,
  organizationId,
}: InvitationResponseProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [pendingAction, setPendingAction] = useState<"accept" | "reject" | null>(
    null
  )

  const respond = async (action: "accept" | "reject") => {
    setError(null)
    setPendingAction(action)
    const result =
      action === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId })

    if (result.error) {
      setError(toOrganizationInvitationError(result.error, "respond"))
      setPendingAction(null)
      return
    }

    if (action === "accept") {
      await authClient.organization.setActive({ organizationId })
    }

    router.replace("/")
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <AuthErrorMessage error={error} />
      <Button
        className="w-full"
        type="button"
        disabled={pendingAction !== null}
        onClick={() => respond("accept")}
      >
        {pendingAction === "accept" ? (
          <LoaderCircle className="animate-spin" />
        ) : null}
        Accept invitation
      </Button>
      <Button
        className="w-full"
        type="button"
        variant="outline"
        disabled={pendingAction !== null}
        onClick={() => respond("reject")}
      >
        {pendingAction === "reject" ? (
          <LoaderCircle className="animate-spin" />
        ) : null}
        Decline
      </Button>
    </div>
  )
}
