"use client"

import { transferOrganizationOwnershipAction } from "@/actions/organization"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import type { AuthError } from "@relayrtc/auth"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { LoaderCircle, ShieldAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface OwnershipCandidate {
  email: string
  id: string
  name: string
}

interface TransferOrganizationOwnershipProps {
  members: readonly OwnershipCandidate[]
  organizationId: string
}

export function TransferOrganizationOwnership({
  members,
  organizationId,
}: TransferOrganizationOwnershipProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, startTransition] = useTransition()
  const [targetMemberId, setTargetMemberId] = useState("")

  const transfer = () => {
    const target = members.find((member) => member.id === targetMemberId)

    if (!target) return
    if (
      !window.confirm(
        `Transfer ownership to ${target.name}? Your role will become Viewer.`
      )
    ) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await transferOrganizationOwnershipAction({
        organizationId,
        targetMemberId,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium">Transfer ownership</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The selected member becomes the only owner. Your role changes to
            Viewer.
          </p>
        </div>
      </div>
      {members.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="ownership-member">New owner</Label>
            <select
              id="ownership-member"
              value={targetMemberId}
              onChange={(event) => setTargetMemberId(event.target.value)}
              disabled={pending}
              className="h-8 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.email})
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !targetMemberId}
            onClick={transfer}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Transfer ownership
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Invite another member before transferring ownership.
        </p>
      )}
      <AuthErrorMessage error={error} />
    </div>
  )
}
