'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { randomId } from '@/lib/format'

type Webhook = { id: string; url: string }

export function ProjectWebhooks() {
  const inputId = useId()
  const [hooks, setHooks] = useState<Webhook[]>([])
  const [url, setUrl] = useState('')

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    setHooks((current) => [...current, { id: randomId('wh', 8), url: url.trim() }])
    setUrl('')
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-pretty text-muted-foreground">
        Receive HTTP callbacks when sessions start, end or change quality. Endpoints must respond with a 2xx status.
      </p>
      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor={inputId}>Endpoint URL</Label>
          <Input
            id={inputId}
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/webhooks/relayr"
            className="h-11 rounded-xl bg-card"
            required
          />
        </div>
        <Button type="submit" size="lg" disabled={!url.trim()}>
          <Plus />
          Add endpoint
        </Button>
      </form>

      {hooks.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No webhook endpoints yet.
        </p>
      ) : (
        <ul className="border-t">
          {hooks.map((hook) => (
            <li key={hook.id} className="flex items-center justify-between gap-3 border-b py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-all font-mono text-[0.8125rem]">{hook.url}</span>
                <Badge variant="secondary">Active</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${hook.url}`}
                onClick={() => setHooks((current) => current.filter((item) => item.id !== hook.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
