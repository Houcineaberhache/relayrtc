"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { authClient } from "@/lib/auth-client"
import {
  toOrganizationSwitchError,
  type AuthError,
} from "@relayrtc/auth"
import { Button } from "@relayrtc/ui/components/button"
import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface SwitchOrganizationButtonProps {
  active: boolean
  organizationId: string
}

export function SwitchOrganizationButton({
  active,
  organizationId,
}: SwitchOrganizationButtonProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, setPending] = useState(false)

  const switchOrganization = async () => {
    setError(null)
    setPending(true)

    const result = await authClient.organization.setActive({ organizationId })

    if (result.error) {
      setError(toOrganizationSwitchError(result.error))
      setPending(false)
      return
    }

    setPending(false)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={active ? "secondary" : "outline"}
        disabled={active || pending}
        onClick={switchOrganization}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {active ? "Active" : "Switch"}
      </Button>
      <AuthErrorMessage error={error} />
    </div>
  )
}
