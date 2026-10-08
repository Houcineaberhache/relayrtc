'use client'

import { useState, type FormEvent } from 'react'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { CopyButton } from '@/components/page/copy-button'
import { SettingList, SettingRow } from '@/components/page/setting-row'
import { TransferOrganizationOwnership } from '@/components/settings/transfer-organization-ownership'
import { DeleteOrganization } from '@/components/settings/delete-organization'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { authError, toOrganizationUpdateError, type AuthError } from '@relayrtc/auth'
import { updateOrganizationInputSchema } from '@relayrtc/validation'
import { useRouter } from 'next/navigation'
import type { ConsoleOrganization } from '@/lib/console-types'

function formatDate(value?: Date | string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

export function OrgGeneral({ organization, memberCount, canManage, isOwner, ownershipCandidates }: {
  organization: ConsoleOrganization
  memberCount: number
  canManage: boolean
  isOwner: boolean
  ownershipCandidates: readonly { id: string; name: string; email: string }[]
}) {
  const router = useRouter()
  const [name, setName] = useState(organization.name)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const unchanged = name === organization.name

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const validation = updateOrganizationInputSchema.safeParse({ organizationId: organization.id, name })
    if (!validation.success) {
      setError(authError('INVALID_ORGANIZATION_NAME'))
      return
    }
    setPending(true)
    const result = await authClient.organization.update({ organizationId: organization.id, data: { name: validation.data.name } })
    if (result.error) {
      setError(toOrganizationUpdateError(result.error))
      setPending(false)
      return
    }
    setSuccess(true)
    setPending(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-normal tracking-tight">Organization settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage the organization identity used across RelayRTC.</p>
      </section>
      <form onSubmit={submit} className="grid w-full gap-5" noValidate>
        <AuthErrorMessage error={error} />
        {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"><CircleCheck className="size-4" />Organization updated</div> : null}
        <div className="grid gap-2"><Label htmlFor="organization-name">Organization name</Label><Input id="organization-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} className="h-11 rounded-xl bg-card" maxLength={120} required /></div>
        {canManage ? <Button type="submit" disabled={pending || unchanged} className="w-full">{pending ? <LoaderCircle className="animate-spin" /> : null}Save changes</Button> : <p className="text-sm text-muted-foreground">Only organization owners and admins can update these settings.</p>}
      </form>
      <SettingList>
        <SettingRow label="Organization ID"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{organization.id}</span><CopyButton value={organization.id} label="Copy organization ID" /></span></SettingRow>
        <SettingRow label="Slug"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{organization.slug}</span><CopyButton value={organization.slug} label="Copy organization slug" /></span></SettingRow>
        <SettingRow label="Members">{memberCount}</SettingRow>
        <SettingRow label="Created">{formatDate(organization.createdAt)}</SettingRow>
      </SettingList>
      {isOwner ? (
        <div>
          <TransferOrganizationOwnership
            organizationId={organization.id}
            members={ownershipCandidates}
          />
          <DeleteOrganization organization={{ id: organization.id, name: organization.name }} />
        </div>
      ) : null}
    </div>
  )
}
