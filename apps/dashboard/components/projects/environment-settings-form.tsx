"use client"

import { updateEnvironmentAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Badge } from "@relayrtc/ui/components/badge"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { updateEnvironmentInputSchema } from "@relayrtc/validation"
import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

interface EnvironmentSettingsFormProps {
  environment: {
    id: string
    name: string
    projectId: string
    slug: string
    type: string
  }
}

export function EnvironmentSettingsForm({
  environment,
}: EnvironmentSettingsFormProps) {
  const router = useRouter()
  const [error, setError] = useState<ProjectError | null>(null)
  const [name, setName] = useState(environment.name)
  const [pending, setPending] = useState(false)
  const [slug, setSlug] = useState(environment.slug)
  const unchanged = name === environment.name && slug === environment.slug

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const validation = updateEnvironmentInputSchema.safeParse({
      environmentId: environment.id,
      name,
      projectId: environment.projectId,
      slug,
    })

    if (!validation.success) {
      setError(projectError("INVALID_ENVIRONMENT_INPUT"))
      return
    }

    setPending(true)
    const result = await updateEnvironmentAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    setName(result.data.name)
    setSlug(result.data.slug)
    setPending(false)
    router.refresh()
  }

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={submit} noValidate>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{environment.name}</p>
        <Badge variant="secondary" className="capitalize">
          {environment.type}
        </Badge>
      </div>
      <AuthErrorMessage error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`environment-name-${environment.id}`}>Name</Label>
          <Input
            id={`environment-name-${environment.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`environment-slug-${environment.id}`}>Slug</Label>
          <Input
            id={`environment-slug-${environment.id}`}
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            maxLength={80}
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || unchanged}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Save environment
        </Button>
      </div>
    </form>
  )
}
