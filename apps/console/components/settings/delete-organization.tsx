'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { deleteOrganizationAction, getOrganizationDeletionImpactAction } from '@/actions/organization'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { DeletionImpact } from '@/components/settings/deletion-impact'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AuthError, ResourceDeletionImpact } from '@relayrtc/auth'

export function DeleteOrganization({ organization }: {
  organization: { id: string; name: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [impact, setImpact] = useState<ResourceDeletionImpact | null>(null)
  const [error, setError] = useState<AuthError | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  function close() {
    if (pending) return
    setOpen(false)
    setConfirmation('')
    setImpact(null)
    setError(null)
  }

  async function showPreview() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setImpact(null)
    const result = await getOrganizationDeletionImpactAction(organization.id)
    setImpact(result.data)
    setError(result.error)
    setLoading(false)
  }

  async function remove() {
    if (!impact || confirmation !== organization.name || pending) return
    setPending(true)
    setError(null)
    const result = await deleteOrganizationAction({
      organizationId: organization.id,
      confirmationName: confirmation,
    })
    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <section aria-labelledby="delete-organization-heading" className="flex flex-col">
      <div className="flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p id="delete-organization-heading" className="text-[0.9375rem]">Delete organization</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Permanently removes all projects, environments, API keys, rooms and usage data.
          </p>
        </div>
        <Button variant="destructive" className="self-start" onClick={() => void showPreview()}>
          Delete
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {organization.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the following resources. Connected participants will be disconnected.
            </DialogDescription>
          </DialogHeader>
          <AuthErrorMessage error={error} />
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading deletion impact...
            </p>
          ) : impact ? <DeletionImpact impact={impact} includeProjects /> : null}
          <div className="grid gap-2">
            <Label htmlFor="organization-delete-confirmation">
              Type <span className="font-semibold">{organization.name}</span> to confirm
            </Label>
            <Input
              id="organization-delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="h-10 rounded-xl"
              autoComplete="off"
              disabled={pending || loading || !impact}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={close}>Cancel</Button>
            <Button
              variant="destructive-solid"
              disabled={!impact || pending || confirmation !== organization.name}
              onClick={() => void remove()}
            >
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Delete organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
