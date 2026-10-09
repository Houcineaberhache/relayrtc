'use client'

import { useRouter } from 'next/navigation'
import { useState, type SyntheticEvent } from 'react'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { deleteProjectAction, getProjectDeletionImpactAction, updateProjectAction } from '@/actions/projects'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { CopyButton } from '@/components/page/copy-button'
import { DeletionImpact } from '@/components/settings/deletion-impact'
import { DeletionProgress } from '@/components/settings/deletion-progress'
import { SettingList, SettingRow } from '@/components/page/setting-row'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConsoleProject } from '@/lib/console-types'
import { projectError, type ProjectError } from '@/lib/projects/project-errors'
import { routes } from '@/lib/routes'
import { deleteProjectInputSchema, updateProjectInputSchema } from '@relayrtc/validation'
import type { ResourceDeletionImpact, RuntimeOperationView } from '@relayrtc/auth'

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

export function ProjectGeneral({ project, orgId, canManage }: { project: ConsoleProject; orgId: string; canManage: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(project.name)
  const [saved, setSaved] = useState(project.name)
  const [error, setError] = useState<ProjectError | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [impact, setImpact] = useState<ResourceDeletionImpact | null>(null)
  const [deleteError, setDeleteError] = useState<ProjectError | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [operation, setOperation] = useState<RuntimeOperationView | null>(null)
  const deleting = project.status === 'deleting' || operation !== null
  const dirty = name !== saved

  async function handleSave(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const validation = updateProjectInputSchema.safeParse({ projectId: project.id, name })
    if (!validation.success) {
      setError(projectError('INVALID_PROJECT_INPUT'))
      return
    }
    setPending(true)
    const result = await updateProjectAction(validation.data)
    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }
    setSaved(result.data.name)
    setName(result.data.name)
    setSuccess(true)
    setPending(false)
    router.refresh()
  }

  async function handleDelete() {
    const validation = deleteProjectInputSchema.safeParse({ projectId: project.id, confirmationName: confirmation })
    if (!validation.success) {
      setDeleteError(projectError('PROJECT_CONFIRMATION_MISMATCH'))
      return
    }
    setPending(true)
    const result = await deleteProjectAction(validation.data)
    if (result.error) {
      setDeleteError(result.error)
      setPending(false)
      return
    }
    setPending(false)
    if (result.data.operation?.status === 'completed') {
      router.replace(routes.org(orgId))
      router.refresh()
    } else if (result.data.operation) {
      setOperation(result.data.operation)
    }
  }

  async function showDeletePreview() {
    setDeleteOpen(true)
    setLoadingImpact(true)
    setImpact(null)
    setDeleteError(null)
    const result = await getProjectDeletionImpactAction(project.id)
    setImpact(result.data)
    setDeleteError(result.error)
    setLoadingImpact(false)
  }

  function closeDelete() {
    if (pending) return
    setDeleteOpen(false)
    setConfirmation('')
    setImpact(null)
    setDeleteError(null)
  }

  return (
    <div className="flex flex-col gap-8">
      {deleting && !deleteOpen ? <DeletionProgress kind="project" resourceId={project.id} destination={routes.org(orgId)} initialOperation={operation} /> : null}
      <form onSubmit={event => { void handleSave(event) }} className="grid w-full gap-5" noValidate>
        <AuthErrorMessage error={error} />
        {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"><CircleCheck className="size-4" />Project settings updated</div> : null}
        <div className="grid gap-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" value={name} onChange={(event) => { setName(event.target.value) }} disabled={!canManage || deleting} className="h-11 rounded-xl bg-card" maxLength={120} required /></div>
        {canManage ? <Button type="submit" disabled={!dirty || pending || deleting} className="w-full">{pending ? <LoaderCircle className="animate-spin" /> : null}Save changes</Button> : <p className="text-sm text-muted-foreground">Only organization owners and admins can modify this project.</p>}
      </form>
      <SettingList>
        <SettingRow label="Project ID"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{project.id}</span><CopyButton value={project.id} label="Copy project ID" /></span></SettingRow>
        <SettingRow label="Slug"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{project.slug}</span><CopyButton value={project.slug} label="Copy project slug" /></span></SettingRow>
        <SettingRow label="Status"><span className="capitalize">{project.status}</span></SettingRow>
        <SettingRow label="Created">{formatDate(project.createdAt)}</SettingRow>
      </SettingList>
      {canManage ? (
        <section aria-labelledby="project-danger" className="flex flex-col">
          <h2 id="project-danger" className="pb-4 text-lg font-medium tracking-tight">Danger zone</h2>
          <div className="flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><div><p className="text-[0.9375rem]">Delete project</p><p className="mt-0.5 text-sm text-muted-foreground">Permanently removes the project, environments, API keys and rooms.</p></div><Button variant="destructive" disabled={deleting} onClick={() => void showDeletePreview()} className="self-start">Delete</Button></div>
        </section>
      ) : null}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) closeDelete() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete {saved}?</DialogTitle><DialogDescription>These resources will be permanently deleted. Connected participants will be disconnected.</DialogDescription></DialogHeader>
          <AuthErrorMessage error={deleteError} />
          {operation ? <DeletionProgress kind="project" resourceId={project.id} destination={routes.org(orgId)} initialOperation={operation} /> : loadingImpact ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading deletion impact...</p> : impact ? <DeletionImpact impact={impact} /> : null}
          <div className="grid gap-2"><Label htmlFor="project-delete-confirmation">Type <span className="font-semibold">{saved}</span> to confirm</Label><Input id="project-delete-confirmation" value={confirmation} onChange={(event) => { setConfirmation(event.target.value) }} placeholder={saved} className="h-10 rounded-xl" autoComplete="off" disabled={pending || loadingImpact || !impact || deleting} /></div>
          <DialogFooter><Button variant="ghost" disabled={pending} onClick={closeDelete}>Cancel</Button><Button variant="destructive-solid" disabled={!impact || confirmation !== saved || pending || deleting} onClick={() => void handleDelete()}>{pending ? <LoaderCircle className="animate-spin" /> : null}Delete project</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
