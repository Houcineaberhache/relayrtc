'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { createProjectAction } from '@/actions/projects'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectError } from '@/lib/projects/project-errors'
import { routes } from '@/lib/routes'
import { projectSlugFromName } from '@relayrtc/validation'

export function CreateProjectCard({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ProjectError | null>(null)
  const slug = projectSlugFromName(name)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!slug) return
    setPending(true)
    setError(null)
    const result = await createProjectAction({ organizationId, name, slug })
    if (result.error || !result.data) {
      setError(result.error)
      setPending(false)
      return
    }
    router.replace(routes.project(organizationId, result.data.id))
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="grid w-full max-w-lg gap-5 rounded-2xl border bg-card p-6" noValidate>
      <div><h1 className="text-2xl font-normal tracking-tight">Create your first project</h1><p className="mt-2 text-sm text-muted-foreground">{organizationName} has no projects yet. Development and Production environments will be created automatically.</p></div>
      <AuthErrorMessage error={error} />
      <div className="grid gap-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My realtime app" className="h-11 rounded-xl" maxLength={120} required />{slug ? <p className="font-mono text-xs text-muted-foreground">{slug}</p> : null}</div>
      <Button type="submit" disabled={pending || !slug} className="self-start">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}Create project</Button>
    </form>
  )
}
