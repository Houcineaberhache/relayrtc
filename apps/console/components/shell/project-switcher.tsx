'use client'

import { Check, ChevronsUpDown, FolderKanban, LoaderCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createProjectAction } from '@/actions/projects'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectError } from '@/lib/projects/project-errors'
import type { ConsoleProject } from '@/lib/console-types'
import { routes } from '@/lib/routes'

export function ProjectSwitcher({ orgId, projects, currentProjectId, canManage, onNavigate }: {
  orgId: string
  projects: ConsoleProject[]
  currentProjectId: string
  canManage: boolean
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ProjectError | null>(null)
  const current = projects.find((project) => project.id === currentProjectId)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setError(null)
    setPending(true)
    const result = await createProjectAction({ organizationId: orgId, name })
    if (result.error || !result.data) {
      setError(result.error)
      setPending(false)
      return
    }
    setDialogOpen(false)
    setName('')
    setPending(false)
    onNavigate?.()
    router.push(routes.project(orgId, result.data.id))
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted" aria-label="Switch project">
          <FolderKanban className="size-6 shrink-0 rounded-md border bg-background p-1 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{current?.name ?? 'Select project'}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 rounded-xl p-1.5">
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} className="h-11 gap-3 rounded-lg px-2.5 text-sm" render={<Link href={routes.project(orgId, project.id)} {...(onNavigate ? { onClick: onNavigate } : {})} />}>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.id === currentProjectId ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
          {canManage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-11 gap-3 rounded-lg px-2.5 text-sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 text-muted-foreground" />
                Create project
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreate} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>Projects isolate environments, API keys, rooms and usage.</DialogDescription>
            </DialogHeader>
            <AuthErrorMessage error={error} />
            <div className="grid gap-2">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input id="new-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My realtime app" autoComplete="off" className="h-10 rounded-xl" maxLength={120} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || pending}>{pending ? <LoaderCircle className="animate-spin" /> : null}Create project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
