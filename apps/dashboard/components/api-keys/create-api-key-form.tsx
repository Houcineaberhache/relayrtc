"use client"

import { createApiKeyAction } from "@/actions/api-keys"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { RevealedApiKey } from "@/components/api-keys/revealed-api-key"
import { apiKeyError, type ApiKeyError } from "@/lib/api-keys/api-key-errors"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import {
  availableApiKeyScopes,
  createApiKeyInputSchema,
} from "@relayrtc/validation"
import { KeyRound, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

const expirationDates: Readonly<Record<string, number | null>> = {
  never: null,
  "30-days": 30,
  "90-days": 90,
  "365-days": 365,
}

export function CreateApiKeyForm({
  environmentId,
  projectId,
}: {
  environmentId: string
  projectId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<ApiKeyError | null>(null)
  const [expiration, setExpiration] = useState("90-days")
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [scopes, setScopes] = useState<string[]>([])
  const [type, setType] = useState<"publishable" | "secret">("secret")

  const toggleScope = (scope: string) => {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setRawKey(null)

    const days = expirationDates[expiration]
    const expiresAt =
      typeof days === "number"
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString()
        : null
    const validation = createApiKeyInputSchema.safeParse({
      environmentId,
      expiresAt,
      name,
      projectId,
      scopes: type === "publishable" ? [] : scopes,
      type,
    })

    if (!validation.success) {
      setError(apiKeyError("INVALID_API_KEY_INPUT"))
      return
    }

    setPending(true)
    const result = await createApiKeyAction(validation.data)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    setName("")
    setScopes([])
    setRawKey(result.data.rawKey)
    setPending(false)
    router.refresh()
  }

  return (
    <form className="space-y-5 rounded-xl border border-dashed p-4" onSubmit={submit} noValidate>
      <div>
        <p className="font-medium">Create API key</p>
        <p className="text-sm text-muted-foreground">
          This key will only authenticate resources in this environment.
        </p>
      </div>
      <AuthErrorMessage error={error} />
      {rawKey ? <RevealedApiKey rawKey={rawKey} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`api-key-name-${environmentId}`}>Name</Label>
          <Input
            id={`api-key-name-${environmentId}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Backend server"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`api-key-type-${environmentId}`}>Type</Label>
          <select
            id={`api-key-type-${environmentId}`}
            value={type}
            onChange={(event) => {
              const nextType = event.target.value === "publishable" ? "publishable" : "secret"
              setType(nextType)
              if (nextType === "publishable") setScopes([])
            }}
            className="h-8 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="secret">Secret</option>
            <option value="publishable">Publishable</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`api-key-expiration-${environmentId}`}>Expiration</Label>
          <select
            id={`api-key-expiration-${environmentId}`}
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            className="h-8 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="30-days">30 days</option>
            <option value="90-days">90 days</option>
            <option value="365-days">1 year</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>
      {type === "secret" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Scopes</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableApiKeyScopes.map((scope) => (
              <label
                key={scope}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="size-4 accent-primary"
                />
                {scope}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          Publishable keys identify this environment and cannot receive privileged scopes.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
        Create key
      </Button>
    </form>
  )
}
