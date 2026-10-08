'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { deleteProjectAction, updateProjectAction } from '@/actions/projects'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { CopyButton } from '@/components/page/copy-button'
import { SettingList, SettingRow } from '@/components/page/setting-row'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConsoleProject } from '@/lib/console-types'
import { projectError, type ProjectError } from '@/lib/projects/project-errors'
import { routes } from '@/lib/routes'
import { deleteProjectInputSchema, updateProjectInputSchema } from '@relayrtc/validation'

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

export function ProjectGeneral({ project, orgId, canManage }: { project: ConsoleProject; orgId: string; canManage: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(project.name)
  const [slug, setSlug] = useState(project.slug)
  const [saved, setSaved] = useState({ name: project.name, slug: project.slug })
  const [error, setError] = useState<ProjectError | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const dirty = name !== saved.name || slug !== saved.slug

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const validation = updateProjectInputSchema.safeParse({ projectId: project.id, name, slug })
    if (!validation.success) {
      setError(projectError('INVALID_PROJECT_INPUT'))
      return
    }
    setPending(true)
    const result = await updateProjectAction(validation.data)
    if (result.error || !result.data) {
      setError(result.error)
      setPending(false)
      return
    }
    setSaved({ name: result.data.name, slug: result.data.slug })
    setName(result.data.name)
    setSlug(result.data.slug)
    setSuccess(true)
    setPending(false)
    router.refresh()
  }

  async function handleDelete() {
    const validation = deleteProjectInputSchema.safeParse({ projectId: project.id, confirmationName: confirmation })
    if (!validation.success) {
      setError(projectError('PROJECT_CONFIRMATION_MISMATCH'))
      return
    }
    setPending(true)
    const result = await deleteProjectAction(validation.data)
    if (result.error) {
      setError(result.error)
      setPending(false)
      setDeleteOpen(false)
      return
    }
    router.replace(routes.org(orgId))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSave} className="grid max-w-xl gap-5" noValidate>
        <AuthErrorMessage error={error} />
        {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"><CircleCheck className="size-4" />Project settings updated</div> : null}
        <div className="grid gap-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} className="h-11 rounded-xl bg-card" maxLength={120} required /></div>
        <div className="grid gap-2"><Label htmlFor="project-slug">Slug</Label><Input id="project-slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} disabled={!canManage} className="h-11 rounded-xl bg-card" maxLength={80} required /><p className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens only.</p></div>
        {canManage ? <Button type="submit" disabled={!dirty || pending} className="self-start">{pending ? <LoaderCircle className="animate-spin" /> : null}Save changes</Button> : <p className="text-sm text-muted-foreground">Only organization owners and admins can modify this project.</p>}
      </form>
      <SettingList>
        <SettingRow label="Project ID"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{project.id}</span><CopyButton value={project.id} label="Copy project ID" /></span></SettingRow>
        <SettingRow label="Status"><span className="capitalize">{project.status}</span></SettingRow>
        <SettingRow label="Created">{formatDate(project.createdAt)}</SettingRow>
      </SettingList>
      {canManage ? (
        <section aria-labelledby="project-danger" className="flex flex-col">
          <h2 id="project-danger" className="pb-4 text-lg font-medium tracking-tight">Danger zone</h2>
          <div className="flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><div><p className="text-[0.9375rem]">Delete project</p><p className="mt-0.5 text-sm text-muted-foreground">Permanently removes the project, environments and API keys.</p></div><Button variant="destructive" onClick={() => setDeleteOpen(true)} className="self-start">Delete</Button></div>
        </section>
      ) : null}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setConfirmation('') }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Delete {saved.name}?</DialogTitle><DialogDescription>Type the project name to confirm. This cannot be undone.</DialogDescription></DialogHeader><Label htmlFor="project-delete-confirmation" className="sr-only">Project name</Label><Input id="project-delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={saved.name} className="h-10 rounded-xl" autoComplete="off" /><DialogFooter><Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="destructive-solid" disabled={confirmation !== saved.name || pending} onClick={() => void handleDelete()}>{pending ? <LoaderCircle className="animate-spin" /> : null}Delete project</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  )
}
