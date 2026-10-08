'use client'

import { Check, ChevronsUpDown, LoaderCircle, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import type { ConsoleOrganization } from '@/lib/console-types'
import { routes } from '@/lib/routes'
import { cn } from '@/lib/utils'

export function LetterAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-md border bg-background text-xs font-medium text-muted-foreground', className)}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function OrgSwitcher({ organizations, currentOrgId, target = 'project', onNavigate }: {
  organizations: ConsoleOrganization[]
  currentOrgId: string
  target?: 'project' | 'settings'
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const current = organizations.find((org) => org.id === currentOrgId) ?? organizations[0]

  async function switchOrganization(orgId: string) {
    if (orgId === currentOrgId) return
    setPendingId(orgId)
    const result = await authClient.organization.setActive({ organizationId: orgId })
    if (!result.error) {
      onNavigate?.()
      router.push(target === 'settings' ? routes.orgSettings(orgId) : routes.org(orgId))
      router.refresh()
    }
    setPendingId(null)
  }

  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted" aria-label="Switch organization">
        <LetterAvatar name={current.name} />
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-xl p-1.5">
        {organizations.map((org) => (
          <DropdownMenuItem key={org.id} className="h-11 gap-3 rounded-lg px-2.5 text-sm" onClick={() => void switchOrganization(org.id)} disabled={pendingId !== null}>
            <LetterAvatar name={org.name} />
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {pendingId === org.id ? <LoaderCircle className="size-4 animate-spin" /> : org.id === current.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-11 gap-3 rounded-lg px-2.5 text-sm" onClick={() => { onNavigate?.(); router.push(routes.onboarding) }}>
          <Plus className="size-4 text-muted-foreground" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
