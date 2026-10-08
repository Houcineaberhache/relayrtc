'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { createProjectAction } from '@/actions/projects'
import { createOrganizationAction } from '@/actions/organization'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { routes } from '@/lib/routes'
import { authError, toAuthError } from '@relayrtc/auth'
import { createOrganizationInputSchema } from '@relayrtc/validation'

export function OnboardingForm() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ code: string; description: string } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const orgValidation = createOrganizationInputSchema.safeParse({ name: orgName })
    if (!orgValidation.success) {
      setError(authError('INVALID_ORGANIZATION_NAME'))
      return
    }
    if (!projectName.trim()) {
      setError(authError('INVALID_REQUEST'))
      return
    }

    setPending(true)
    const orgResult = await createOrganizationAction(orgValidation.data)
    if (orgResult.error || !orgResult.data) {
      setError(orgResult.error ?? authError('INVALID_REQUEST'))
      setPending(false)
      return
    }

    const organizationId = orgResult.data.id
    const activeResult = await authClient.organization.setActive({ organizationId })
    if (activeResult.error) {
      setError(toAuthError(activeResult.error))
      setPending(false)
      return
    }

    const projectResult = await createProjectAction({ organizationId, name: projectName })
    if (projectResult.error || !projectResult.data) {
      setError({ code: projectResult.error?.code ?? 'PROJECT_CREATION_FAILED', description: projectResult.error?.description ?? 'The organization was created, but the first project could not be created.' })
      setPending(false)
      router.refresh()
      return
    }

    router.replace(routes.project(organizationId, projectResult.data.id))
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full max-w-md gap-6" noValidate>
      <div>
        <h1 className="text-balance text-3xl font-normal tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-pretty text-muted-foreground">Create your organization and first project. Development and Production environments are created automatically.</p>
      </div>
      <AuthErrorMessage error={error} />
      <div className="grid gap-2">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input id="organization-name" value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder="Acme Inc." className="h-11 rounded-xl px-3.5" maxLength={120} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-name">First project</Label>
        <Input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Chat Playground" className="h-11 rounded-xl px-3.5" maxLength={120} required />
      </div>
      <Button type="submit" size="lg" className="h-11 rounded-full" disabled={pending || !orgName.trim() || !projectName.trim()}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {pending ? 'Creating workspace…' : 'Continue to console'}
      </Button>
    </form>
  )
}
