"use client"

import { createEnvironmentAction } from "@/actions/projects"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { projectError, type ProjectError } from "@/lib/projects/project-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import {
  createEnvironmentInputSchema,
  projectSlugFromName,
} from "@relayrtc/validation"
import { LoaderCircle, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

export function CreateEnvironmentForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [deletionProtected, setDeletionProtected] = useState(false)
  const [error, setError] = useState<ProjectError | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [type, setType] = useState<"preview" | "staging" | "custom">("staging")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const validation = createEnvironmentInputSchema.safeParse({
      deletionProtected,
      name,
      projectId,
      slug,
      type,
    })

    if (!validation.success) {
      setError(projectError("INVALID_ENVIRONMENT_INPUT"))
      return
    }

    setPending(true)
    const result = await createEnvironmentAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    setDeletionProtected(false)
    setName("")
    setSlug("")
    setSlugEdited(false)
    setPending(false)
    router.refresh()
  }

  return (
    <form className="space-y-5 rounded-xl border border-dashed p-4" onSubmit={submit} noValidate>
      <div>
        <p className="font-medium">Add environment</p>
        <p className="text-sm text-muted-foreground">
          Create another isolated boundary for keys and realtime resources.
        </p>
      </div>
      <AuthErrorMessage error={error} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="new-environment-name">Name</Label>
          <Input
            id="new-environment-name"
            value={name}
            onChange={(event) => {
              const nextName = event.target.value
              setName(nextName)
              if (!slugEdited) setSlug(projectSlugFromName(nextName))
            }}
            placeholder="Staging"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-environment-slug">Slug</Label>
          <Input
            id="new-environment-slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase())
              setSlugEdited(true)
            }}
            placeholder="staging"
            maxLength={80}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-environment-type">Type</Label>
          <select
            id="new-environment-type"
            value={type}
            onChange={(event) => {
              const nextType = event.target.value
              setType(
                nextType === "preview" || nextType === "custom"
                  ? nextType
                  : "staging"
              )
            }}
            className="h-8 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="staging">Staging</option>
            <option value="preview">Preview</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
        <input
          type="checkbox"
          checked={deletionProtected}
          onChange={(event) => setDeletionProtected(event.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block font-medium">Protect from deletion</span>
          <span className="text-muted-foreground">
            The environment must be unprotected before it can be deleted.
          </span>
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
        Create environment
      </Button>
    </form>
  )
}
