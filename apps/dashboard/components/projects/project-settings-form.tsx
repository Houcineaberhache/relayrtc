"use client"

import { updateProjectAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { updateProjectInputSchema } from "@relayrtc/validation"
import { CircleCheck, Copy, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function ProjectSettingsForm({
  project,
}: {
  project: { id: string; name: string; slug: string }
}) {
  const router = useRouter()
  const [error, setError] = useState<ProjectError | null>(null)
  const [name, setName] = useState(project.name)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const unchanged = name === project.name

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const validation = updateProjectInputSchema.safeParse({
      name,
      projectId: project.id,
    })

    if (!validation.success) {
      setError(projectError("INVALID_PROJECT_INPUT"))
      return
    }

    setPending(true)
    const result = await updateProjectAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    setName(result.data.name)
    setSuccess(true)
    setPending(false)
    router.refresh()
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <AuthErrorMessage error={error} />
      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4" />
          Project settings updated
        </div>
      ) : null}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="project-settings-name">Project name</Label>
          <Input
            id="project-settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <p>Project ID</p>
        <div className="flex items-center gap-2"><code className="break-all">{project.id}</code><Button type="button" variant="ghost" aria-label="Copy project ID" onClick={() => void navigator.clipboard.writeText(project.id)}><Copy className="size-4" /></Button></div>
        <p>Slug</p>
        <div className="flex items-center gap-2"><code className="break-all">{project.slug}</code><Button type="button" variant="ghost" aria-label="Copy project slug" onClick={() => void navigator.clipboard.writeText(project.slug)}><Copy className="size-4" /></Button></div>
      </div>
      <Button type="submit" className="w-full" disabled={pending || unchanged}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Save project
      </Button>
    </form>
  )
}
