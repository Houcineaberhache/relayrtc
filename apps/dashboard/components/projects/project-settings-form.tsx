"use client"

import { updateProjectAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { updateProjectInputSchema } from "@relayrtc/validation"
import { CircleCheck, LoaderCircle } from "lucide-react"
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
  const [slug, setSlug] = useState(project.slug)
  const [success, setSuccess] = useState(false)
  const unchanged = name === project.name && slug === project.slug

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const validation = updateProjectInputSchema.safeParse({
      name,
      projectId: project.id,
      slug,
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
    setSlug(result.data.slug)
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
      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="space-y-2">
          <Label htmlFor="project-settings-slug">Slug</Label>
          <Input
            id="project-settings-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={80}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending || unchanged}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Save project
      </Button>
    </form>
  )
}
