"use client"

import {
  deleteEnvironmentAction,
  updateEnvironmentAction,
} from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Badge } from "@relayrtc/ui/components/badge"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import {
  deleteEnvironmentInputSchema,
  updateEnvironmentInputSchema,
} from "@relayrtc/validation"
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

interface EnvironmentSettingsFormProps {
  environment: {
    id: string
    deletionProtected: boolean
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
  const coreEnvironment =
    environment.type === "development" || environment.type === "production"
  const [deletionProtected, setDeletionProtected] = useState(
    environment.deletionProtected
  )
  const [error, setError] = useState<ProjectError | null>(null)
  const [name, setName] = useState(environment.name)
  const [pendingAction, setPendingAction] = useState<"delete" | "update" | null>(null)
  const [slug, setSlug] = useState(environment.slug)
  const unchanged =
    name === environment.name &&
    slug === environment.slug &&
    deletionProtected === environment.deletionProtected

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const validation = updateEnvironmentInputSchema.safeParse({
      deletionProtected,
      environmentId: environment.id,
      name,
      projectId: environment.projectId,
      slug,
    })

    if (!validation.success) {
      setError(projectError("INVALID_ENVIRONMENT_INPUT"))
      return
    }

    setPendingAction("update")
    const result = await updateEnvironmentAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPendingAction(null)
      return
    }

    setName(result.data.name)
    setSlug(result.data.slug)
    setDeletionProtected(result.data.deletionProtected)
    setPendingAction(null)
    router.refresh()
  }

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${environment.name} and all of its API keys?`)) {
      return
    }

    setError(null)
    const validation = deleteEnvironmentInputSchema.safeParse({
      environmentId: environment.id,
      projectId: environment.projectId,
    })

    if (!validation.success) {
      setError(projectError("INVALID_ENVIRONMENT_INPUT"))
      return
    }

    setPendingAction("delete")
    const result = await deleteEnvironmentAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPendingAction(null)
      return
    }

    router.refresh()
  }

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={submit} noValidate>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{environment.name}</p>
          <code className="block truncate text-xs text-muted-foreground">
            {environment.id}
          </code>
        </div>
        <div className="flex gap-2">
          {deletionProtected ? (
            <Badge variant="outline">
              <ShieldCheck /> Protected
            </Badge>
          ) : null}
          <Badge variant="secondary" className="capitalize">
            {environment.type}
          </Badge>
        </div>
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
      <label
        className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
          coreEnvironment ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={deletionProtected}
          onChange={(event) => setDeletionProtected(event.target.checked)}
          disabled={coreEnvironment}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block font-medium">Protect from deletion</span>
          <span className="text-muted-foreground">
            {coreEnvironment
              ? "Development and Production are always protected."
              : "Unprotect this environment before deleting it."}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pendingAction !== null || unchanged}
        >
          {pendingAction === "update" ? (
            <LoaderCircle className="animate-spin" />
          ) : null}
          Save environment
        </Button>
        {!coreEnvironment && !deletionProtected ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pendingAction !== null}
            onClick={remove}
          >
            {pendingAction === "delete" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            Delete environment
          </Button>
        ) : null}
      </div>
    </form>
  )
}
