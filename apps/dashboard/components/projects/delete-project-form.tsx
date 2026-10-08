"use client"

import { deleteProjectAction, getProjectDeletionImpactAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { deleteProjectInputSchema } from "@relayrtc/validation"
import type { ResourceDeletionImpact } from "@relayrtc/auth"
import { LoaderCircle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function DeleteProjectForm({
  project,
}: {
  project: { id: string; name: string }
}) {
  const router = useRouter()
  const [confirmationName, setConfirmationName] = useState("")
  const [error, setError] = useState<ProjectError | null>(null)
  const [pending, setPending] = useState(false)
  const [impact, setImpact] = useState<ResourceDeletionImpact | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const validation = deleteProjectInputSchema.safeParse({
      confirmationName,
      projectId: project.id,
    })

    if (!validation.success) {
      setError(projectError("PROJECT_CONFIRMATION_MISMATCH"))
      return
    }

    const preview = await getProjectDeletionImpactAction(project.id)
    if (preview.error || !preview.data) {
      setError(preview.error ?? projectError("PROJECT_DELETION_FAILED"))
      return
    }
    setImpact(preview.data)
    if (!window.confirm(`Permanently delete ${project.name}? This removes ${preview.data.environments} environments, ${preview.data.apiKeys} API keys and ${preview.data.rooms} rooms. ${preview.data.roomsToEnd} rooms will be terminated and ${preview.data.connectedParticipants} connected participants disconnected.`)) {
      return
    }

    setPending(true)
    const result = await deleteProjectAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    router.push("/")
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <AuthErrorMessage error={error} />
      {impact ? <p className="text-sm text-muted-foreground">This deletes {impact.environments} environments, {impact.apiKeys} API keys and {impact.rooms} rooms. {impact.connectedParticipants} connected participants will be disconnected.</p> : null}
      <div className="space-y-2">
        <Label htmlFor="project-delete-confirmation">
          Enter <span className="font-semibold">{project.name}</span> to confirm
        </Label>
        <Input
          id="project-delete-confirmation"
          value={confirmationName}
          onChange={(event) => setConfirmationName(event.target.value)}
          autoComplete="off"
          required
        />
      </div>
      <Button
        type="submit"
        variant="destructive"
        disabled={pending || confirmationName !== project.name}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
        Delete project permanently
      </Button>
    </form>
  )
}
