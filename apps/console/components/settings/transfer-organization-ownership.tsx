'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LoaderCircle } from 'lucide-react'
import { transferOrganizationOwnershipAction } from '@/actions/organization'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { SimpleSelect } from '@/components/page/simple-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { AuthError } from '@relayrtc/auth'

interface OwnershipCandidate {
  id: string
  name: string
  email: string
}

export function TransferOrganizationOwnership({
  organizationId,
  members,
}: {
  organizationId: string
  members: readonly OwnershipCandidate[]
}) {
  const router = useRouter()
  const [targetMemberId, setTargetMemberId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, startTransition] = useTransition()
  const target = members.find((member) => member.id === targetMemberId)

  function closeDialog() {
    setConfirmOpen(false)
    setTargetMemberId('')
    setError(null)
  }

  function transfer() {
    if (!target || pending) return

    setError(null)
    startTransition(async () => {
      const result = await transferOrganizationOwnershipAction({
        organizationId,
        targetMemberId: target.id,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      closeDialog()
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="organization-danger" className="flex flex-col">
      <h2 id="organization-danger" className="pb-4 text-lg font-medium tracking-tight">
        Danger zone
      </h2>
      <div className="flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-[0.9375rem]">Transfer ownership</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {members.length > 0
              ? 'Choose a new owner. Your role will become Viewer.'
              : 'Invite another member before transferring ownership.'}
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={members.length === 0}
          onClick={() => setConfirmOpen(true)}
          className="self-start"
        >
          Transfer
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!pending) {
            if (open) setConfirmOpen(true)
            else closeDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              Select a member to become the new owner. Your role will become Viewer.
            </DialogDescription>
          </DialogHeader>
          <AuthErrorMessage error={error} />
          <div className="grid gap-2">
            <Label htmlFor="ownership-member">New owner</Label>
            <SimpleSelect
              id="ownership-member"
              value={targetMemberId}
              onValueChange={setTargetMemberId}
              options={members.map((member) => ({
                value: member.id,
                label: `${member.name} (${member.email})`,
              }))}
              placeholder="Select a member"
              className="w-full rounded-xl sm:w-full"
            />
          </div>
          {target ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              {target.name} will become the owner. This will remove your owner access.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="button" variant="destructive-solid" disabled={!target || pending} onClick={transfer}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Transfer ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
