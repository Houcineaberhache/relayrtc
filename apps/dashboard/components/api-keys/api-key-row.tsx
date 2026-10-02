"use client"

import { revokeApiKeyAction, rotateApiKeyAction } from "@/actions/api-keys"
import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { RevealedApiKey } from "@/components/api-keys/revealed-api-key"
import type { ApiKeyError } from "@/lib/api-keys/api-key-errors"
import { Badge } from "@relayrtc/ui/components/badge"
import { Button } from "@relayrtc/ui/components/button"
import { KeyRound, LoaderCircle, RotateCw, ShieldOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export interface ApiKeyView {
  id: string
  environmentId: string
  projectId: string
  name: string
  type: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

const formatDate = (value: string | null): string =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never"

export function ApiKeyRow({
  apiKey,
  canManage,
}: {
  apiKey: ApiKeyView
  canManage: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<ApiKeyError | null>(null)
  const [pendingAction, setPendingAction] = useState<"revoke" | "rotate" | null>(null)
  const [rawKey, setRawKey] = useState<string | null>(null)
  const expired = apiKey.expiresAt !== null && new Date(apiKey.expiresAt) <= new Date()
  const inactive = apiKey.revokedAt !== null || expired
  const status = apiKey.revokedAt ? "revoked" : expired ? "expired" : "active"

  const rotate = async () => {
    if (!window.confirm(`Rotate ${apiKey.name}? The current key will stop working immediately.`)) {
      return
    }

    setError(null)
    setRawKey(null)
    setPendingAction("rotate")
    const result = await rotateApiKeyAction({
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
    })

    if (result.error) {
      setError(result.error)
      setPendingAction(null)
      return
    }

    setRawKey(result.data.rawKey)
    setPendingAction(null)
    router.refresh()
  }

  const revoke = async () => {
    if (!window.confirm(`Revoke ${apiKey.name}? This cannot be undone.`)) return

    setError(null)
    setRawKey(null)
    setPendingAction("revoke")
    const result = await revokeApiKeyAction({
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
    })

    if (result.error) {
      setError(result.error)
      setPendingAction(null)
      return
    }

    setPendingAction(null)
    router.refresh()
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{apiKey.name}</p>
            <code className="text-xs text-muted-foreground">{apiKey.prefix}...</code>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="capitalize">{apiKey.type}</Badge>
          <Badge variant={inactive ? "secondary" : "default"} className="capitalize">
            {status}
          </Badge>
        </div>
      </div>
      <AuthErrorMessage error={error} />
      {rawKey ? <RevealedApiKey rawKey={rawKey} /> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatDate(apiKey.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{formatDate(apiKey.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last used</dt>
          <dd>{formatDate(apiKey.lastUsedAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {apiKey.scopes.length > 0 ? (
          apiKey.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">{scope}</Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">No privileged scopes</span>
        )}
      </div>
      {canManage && !inactive ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={rotate}
          >
            {pendingAction === "rotate" ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
            Rotate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pendingAction !== null}
            onClick={revoke}
          >
            {pendingAction === "revoke" ? <LoaderCircle className="animate-spin" /> : <ShieldOff />}
            Revoke
          </Button>
        </div>
      ) : null}
    </div>
  )
}
