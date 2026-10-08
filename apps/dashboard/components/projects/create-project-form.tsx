"use client"

import { createProjectAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { createProjectInputSchema } from "@relayrtc/validation"
import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function CreateProjectForm({
  organizationId,
}: {
  organizationId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<ProjectError | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const validation = createProjectInputSchema.safeParse({
      name,
      organizationId,
    })

    if (!validation.success) {
      setError(projectError("INVALID_PROJECT_INPUT"))
      return
    }

    setPending(true)
    const result = await createProjectAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    router.push(`/projects/${result.data.id}`)
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <AuthErrorMessage error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            placeholder="Video Classroom"
            maxLength={120}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Create project
      </Button>
    </form>
  )
}
