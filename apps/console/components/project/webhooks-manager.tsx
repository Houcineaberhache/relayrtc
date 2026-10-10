'use client'

import { useId, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Edit3, List, LoaderCircle, MoreHorizontal, Pause, Play, Plus, RotateCw, Search, Trash2, Webhook } from 'lucide-react'
import { webhookConfigurationSchema } from '@relayrtc/validation'
import { deleteWebhookEndpointAction, listWebhookEndpointsAction, rotateWebhookSecretAction, updateWebhookEndpointAction } from '@/actions/webhooks'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { CopyButton } from '@/components/page/copy-button'
import { PageHeader } from '@/components/page/page-header'
import { SimpleSelect } from '@/components/page/simple-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EndpointForm } from '@/components/webhooks/endpoint-form'
import { WebhookDeliveries } from '@/components/webhooks/deliveries'
import type { ConsoleEnvironment } from '@/lib/console-types'
import { eventGroups, unavailableWebhookError, type WebhookConfiguration, type WebhookError } from '@/lib/webhooks/contracts'

type EndpointAction = { type: 'rotate' | 'delete' | 'enable' | 'disable'; endpoint: WebhookConfiguration }

export function WebhooksManager({ projectId, environmentId, environments, endpoints, canManage, initialError }: {
  projectId: string
  environmentId: string
  environments: readonly ConsoleEnvironment[]
  endpoints: readonly WebhookConfiguration[]
  canManage: boolean
  initialError: WebhookError | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchId = useId()
  const refreshSequence = useRef(0)
  const [rows, setRows] = useState([...endpoints])
  const [query, setQuery] = useState('')
  const [error, setError] = useState(initialError)
  const [refreshing, setRefreshing] = useState(false)
  const [editor, setEditor] = useState<{ endpoint: WebhookConfiguration | null } | null>(null)
  const [formPending, setFormPending] = useState(false)
  const [action, setAction] = useState<EndpointAction | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<WebhookError | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [deliveryEndpoint, setDeliveryEndpoint] = useState<WebhookConfiguration | null>(null)
  const environment = environments.find((candidate) => candidate.id === environmentId)
  const busy = formPending || actionPending
  const visible = rows.filter((endpoint) => `${endpoint.url} ${endpoint.id} ${endpoint.eventTypes.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  const labels = new Map(eventGroups.flatMap((group) => group.events.map((event) => [event.value, event.label] as const)))

  function saved(endpoint: WebhookConfiguration, signingSecret?: string) {
    refreshSequence.current++
    setRefreshing(false)
    setRows((current) => current.some((row) => row.id === endpoint.id)
      ? current.map((row) => row.id === endpoint.id ? endpoint : row) : [endpoint, ...current])
    setDeliveryEndpoint((current) => current?.id === endpoint.id ? endpoint : current)
    setEditor(null)
    setError(null)
    if (signingSecret) setSecret(signingSecret)
    router.refresh()
  }

  async function refresh() {
    const sequence = ++refreshSequence.current
    setRefreshing(true)
    try {
      const result = await listWebhookEndpointsAction({ projectId, environmentId })
      if (sequence !== refreshSequence.current) return
      if (result.error) setError(result.error)
      else {
        setRows(result.data.endpoints)
        setDeliveryEndpoint((current) => current ? result.data.endpoints.find((row) => row.id === current.id) ?? { ...current, status: 'disabled' } : null)
        setError(null)
      }
    } catch {
      if (sequence === refreshSequence.current) setError(unavailableWebhookError)
    } finally {
      if (sequence === refreshSequence.current) setRefreshing(false)
    }
  }

  async function confirmAction() {
    if (!action || actionPending) return
    setActionPending(true)
    setActionError(null)
    const scope = { projectId, environmentId, endpointId: action.endpoint.id }
    try {
      if (action.type === 'rotate') {
        const result = await rotateWebhookSecretAction(scope)
        if (result.error) { setActionError(result.error); return }
        saved(webhookConfigurationSchema.strip().parse(result.data), result.data.signingSecret)
      } else if (action.type === 'delete') {
        const result = await deleteWebhookEndpointAction(scope)
        if (result.error) { setActionError(result.error); return }
        refreshSequence.current++
        setRefreshing(false)
        setRows((current) => current.filter((row) => row.id !== action.endpoint.id))
        setDeliveryEndpoint((current) => current?.id === action.endpoint.id ? { ...current, status: 'disabled' } : current)
        router.refresh()
      } else {
        const result = await updateWebhookEndpointAction({ ...scope, configuration: { status: action.type === 'enable' ? 'enabled' : 'disabled' } })
        if (result.error) { setActionError(result.error); return }
        saved(result.data)
      }
      setAction(null)
    } catch {
      setActionError(unavailableWebhookError)
    } finally {
      setActionPending(false)
    }
  }

  function openAction(type: EndpointAction['type'], endpoint: WebhookConfiguration) {
    setActionError(null)
    setAction({ type, endpoint })
  }

  return <div className="flex flex-col gap-6">
    <PageHeader title="Webhooks" description="Send room, participant and connection events to your application."
      actions={canManage && environment ? <Button size="lg" disabled={busy || error !== null} onClick={() => setEditor({ endpoint: null })}><Plus />New endpoint</Button> : null} />
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor={searchId} className="sr-only">Search webhook endpoints</Label>
        <Input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-11 rounded-xl bg-card pl-10" />
      </div>
      {environment ? <SimpleSelect value={environmentId} aria-label="Environment" options={environments.map((item) => ({ value: item.id, label: item.name }))}
        onValueChange={(value) => {
          if (value === environmentId || busy || secret) return
          const params = new URLSearchParams(searchParams.toString())
          params.set('environmentId', value)
          router.push(`${pathname}?${params}`)
        }} /> : null}
      <div className="flex items-center gap-2 sm:ml-auto">
        {!canManage ? <Badge variant="outline">Read only</Badge> : null}
        <Button variant="outline" size="icon" aria-label="Refresh endpoints" disabled={!environment || refreshing || busy} onClick={() => { void refresh() }}><RotateCw className={refreshing ? 'animate-spin' : ''} /></Button>
      </div>
    </div>
    <AuthErrorMessage error={error} />
    {!error && visible.length === 0 ? <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Webhook className="size-5" /></span>
      <p className="font-medium">{!environment ? 'No active environments' : query ? 'No endpoints match your search' : 'No webhook endpoints yet'}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{!environment ? 'An active environment is required to configure webhooks.' : query ? 'Try a different URL or event.' : canManage ? `Create an endpoint to receive events from ${environment.name}.` : 'An organization owner or admin can create endpoints.'}</p>
    </div> : null}
    <ul className="grid gap-3">
      {visible.map((endpoint) => <li key={endpoint.id} className="flex items-start gap-3 rounded-2xl bg-card p-4 sm:gap-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="break-all text-base font-medium">{endpoint.url}</h2><Badge variant={endpoint.status === 'enabled' ? 'secondary' : 'outline'}>{endpoint.status === 'enabled' ? 'Enabled' : 'Disabled'}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-0.5"><span className="break-all font-mono text-[0.8125rem]">{endpoint.id}</span><CopyButton value={endpoint.id} label="Copy endpoint ID" /></span>
            <span>Created {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(endpoint.createdAt))}</span><span>Signing key v{endpoint.signingSecretVersion}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">{endpoint.eventTypes.map((event) => <Badge key={event} variant="outline">{labels.get(event) ?? event}</Badge>)}</div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setDeliveryEndpoint(endpoint)}><List />View deliveries</Button>
        </div>
        {canManage ? <DropdownMenu>
          <DropdownMenuTrigger disabled={busy} aria-label={`Actions for ${endpoint.url}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5">
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => setEditor({ endpoint })}><Edit3 className="size-4" />Edit endpoint</DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => openAction(endpoint.status === 'enabled' ? 'disable' : 'enable', endpoint)}>
              {endpoint.status === 'enabled' ? <Pause className="size-4" /> : <Play className="size-4" />}{endpoint.status === 'enabled' ? 'Disable endpoint' : 'Enable endpoint'}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => openAction('rotate', endpoint)}><RotateCw className="size-4" />Rotate secret</DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-lg text-destructive focus:text-destructive" onClick={() => openAction('delete', endpoint)}><Trash2 className="size-4" />Delete endpoint</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </li>)}
    </ul>
    {deliveryEndpoint ? <WebhookDeliveries key={deliveryEndpoint.id} projectId={projectId} environmentId={environmentId} endpoint={deliveryEndpoint} canManage={canManage} onClose={() => setDeliveryEndpoint(null)} /> : null}
    <Dialog open={editor !== null} onOpenChange={(open) => { if (!open && !formPending) setEditor(null) }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!formPending}>
        {editor ? <EndpointForm key={editor.endpoint?.id ?? 'create'} projectId={projectId} environmentId={environmentId} environmentName={environment?.name ?? 'this environment'} endpoint={editor.endpoint} onClose={() => setEditor(null)} onPendingChange={setFormPending} onSaved={saved} /> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !actionPending) setAction(null) }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!actionPending}>
        <DialogHeader>
          <DialogTitle>{action?.type === 'rotate' ? 'Rotate signing secret?' : action?.type === 'delete' ? 'Delete endpoint?' : action?.type === 'disable' ? 'Disable endpoint?' : 'Enable endpoint?'}</DialogTitle>
          <DialogDescription>{action?.type === 'rotate' ? 'The current secret stops working immediately. Update your receiver with the new secret after rotating.'
            : action?.type === 'delete' ? 'This endpoint will stop receiving events. Pending deliveries will be cancelled. This cannot be undone.'
            : action?.type === 'disable' ? 'New events will not be sent to this endpoint. Pending deliveries will be cancelled.'
            : 'This endpoint will start receiving new events. Previously cancelled deliveries can be replayed separately.'}</DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-xl border bg-muted/40 p-3 text-sm">{action?.endpoint.url}</p>
        <AuthErrorMessage error={actionError} />
        <DialogFooter>
          <Button variant="ghost" disabled={actionPending} onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'delete' ? 'destructive-solid' : 'default'} disabled={actionPending} onClick={() => { void confirmAction() }}>
            {actionPending ? <LoaderCircle className="animate-spin" /> : null}{action?.type === 'rotate' ? 'Rotate secret' : action?.type === 'delete' ? 'Delete endpoint' : action?.type === 'disable' ? 'Disable endpoint' : 'Enable endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={secret !== null} onOpenChange={(open) => { if (!open) setSecret(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Save your signing secret</DialogTitle><DialogDescription>This is the only time the full secret is shown. Store it securely and use it to verify webhook signatures.</DialogDescription></DialogHeader>
        {secret ? <div className="flex items-center gap-1 rounded-xl border bg-muted/50 py-1.5 pl-3 pr-1.5"><code className="min-w-0 flex-1 break-all font-mono text-[0.8125rem]">{secret}</code><CopyButton value={secret} label="Copy signing secret" /></div> : null}
        <DialogFooter><Button onClick={() => setSecret(null)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
