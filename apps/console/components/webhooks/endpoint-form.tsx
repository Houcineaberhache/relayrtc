'use client'

import { useId, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { createWebhookInputSchema, webhookConfigurationSchema } from '@relayrtc/validation'
import { createWebhookEndpointAction, updateWebhookEndpointAction } from '@/actions/webhooks'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { SimpleSelect } from '@/components/page/simple-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { eventGroups, unavailableWebhookError, type WebhookConfiguration, type WebhookError, type WebhookEventType } from '@/lib/webhooks/contracts'

export function EndpointForm({ projectId, environmentId, environmentName, endpoint, onClose, onPendingChange, onSaved }: {
  projectId: string
  environmentId: string
  environmentName: string
  endpoint: WebhookConfiguration | null
  onClose: () => void
  onPendingChange: (pending: boolean) => void
  onSaved: (endpoint: WebhookConfiguration, secret?: string) => void
}) {
  const urlId = useId()
  const statusId = useId()
  const [url, setUrl] = useState(endpoint?.url ?? '')
  const [events, setEvents] = useState<WebhookEventType[]>(endpoint?.eventTypes ?? eventGroups.flatMap((group) => group.events.map((event) => event.value)))
  const [status, setStatus] = useState<'enabled' | 'disabled'>(endpoint?.status ?? 'enabled')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<WebhookError | null>(null)

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const validation = createWebhookInputSchema.safeParse({ url: url.trim(), eventTypes: events, status })
    if (!validation.success) {
      setError({ code: 'INVALID_WEBHOOK_INPUT', description: 'Enter a public HTTP or HTTPS URL and select at least one event.' })
      return
    }
    setPending(true)
    onPendingChange(true)
    setError(null)
    try {
      if (endpoint) {
        const result = await updateWebhookEndpointAction({ projectId, environmentId, endpointId: endpoint.id, configuration: {
          eventTypes: validation.data.eventTypes, status: validation.data.status,
          ...(validation.data.url !== endpoint.url ? { url: validation.data.url } : {}),
        } })
        if (result.error) setError(result.error)
        else onSaved(result.data)
      } else {
        const result = await createWebhookEndpointAction({ projectId, environmentId, configuration: validation.data })
        if (result.error) setError(result.error)
        else onSaved(webhookConfigurationSchema.strip().parse(result.data), result.data.signingSecret)
      }
    } catch {
      setError(unavailableWebhookError)
    } finally {
      setPending(false)
      onPendingChange(false)
    }
  }

  return <form onSubmit={(event) => { void submit(event) }} className="grid gap-5">
    <DialogHeader>
      <DialogTitle>{endpoint ? 'Edit endpoint' : 'New endpoint'}</DialogTitle>
      <DialogDescription>Receive events from {environmentName} at your application&apos;s webhook URL.</DialogDescription>
    </DialogHeader>
    <AuthErrorMessage error={error} />
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <div className="grid gap-2">
        <Label htmlFor={urlId}>Endpoint URL</Label>
        <Input id={urlId} type="url" value={url} onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/webhooks/relayrtc" className="h-10 rounded-xl" maxLength={2048} required autoFocus />
        <p className="text-xs text-muted-foreground">Use a public HTTP or HTTPS address that responds with a 2xx status.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={statusId}>Status</Label>
        <SimpleSelect id={statusId} value={status} onValueChange={(value) => setStatus(value === 'disabled' ? 'disabled' : 'enabled')}
          options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} className="w-full sm:w-full" />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">Events</legend>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
          <Checkbox checked={events.length === 10} onCheckedChange={(checked) => setEvents(checked ? eventGroups.flatMap((group) => group.events.map((event) => event.value)) : [])} />
          <span className="text-sm font-medium">All events</span><span className="ml-auto text-xs text-muted-foreground">{events.length} selected</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {eventGroups.map((group) => <fieldset key={group.label} className="grid gap-2 rounded-xl border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">{group.label}</legend>
            {group.events.map((event) => <label key={event.value} className="flex cursor-pointer items-center gap-2.5 py-0.5 text-sm">
              <Checkbox checked={events.includes(event.value)} onCheckedChange={(checked) => setEvents((current) => checked
                ? [...current.filter((value) => value !== event.value), event.value] : current.filter((value) => value !== event.value))} />
              <span>{event.label}</span>
            </label>)}
          </fieldset>)}
        </div>
      </fieldset>
    </fieldset>
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type="submit" disabled={pending || !url.trim() || events.length === 0}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}{endpoint ? 'Save changes' : 'Create endpoint'}
      </Button>
    </DialogFooter>
  </form>
}
