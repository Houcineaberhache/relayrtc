'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { getDeletionOperationAction } from '@/actions/resource-deletion'
import { Button } from '@/components/ui/button'
import type { RuntimeOperationView } from '@relayrtc/auth'

export function DeletionProgress({ kind, resourceId, destination, initialOperation }: {
  kind: 'project' | 'organization' | 'environment'
  resourceId: string
  destination?: string
  initialOperation?: RuntimeOperationView | null
}) {
  const router = useRouter()
  const [operation, setOperation] = useState(initialOperation ?? null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const result = await getDeletionOperationAction({ kind, resourceId })
        if (cancelled) return
        setError(result.error)
        if (result.data) setOperation(result.data)
        if (result.data?.status === 'completed') {
          if (destination) router.replace(destination)
          router.refresh()
          return
        }
      } catch {
        if (cancelled) return
        setError('Deletion progress is temporarily unavailable. Cleanup continues automatically.')
      }
      timer = setTimeout(() => { void poll() }, 2_000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [kind, resourceId, destination, router, refresh])

  if (operation?.status === 'completed') return null

  return (
    <div role="status" aria-live="polite" className="rounded-xl border bg-muted/30 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <LoaderCircle className="size-4 animate-spin" />
        {operation?.status === 'failed' ? 'Retrying cleanup' : 'Deletion in progress'}
      </p>
      <p className="mt-2 text-muted-foreground">
        {error ?? operation?.lastError ?? 'Closing live connections and media resources. Usage history will be retained.'}
      </p>
      {operation?.status === 'failed' ? <p className="mt-2 text-muted-foreground">Cleanup retries automatically. You can leave this page.</p> : null}
      {error ? <Button variant="ghost" className="mt-2" onClick={() => { setRefresh(value => value + 1) }}>Check again</Button> : null}
    </div>
  )
}
