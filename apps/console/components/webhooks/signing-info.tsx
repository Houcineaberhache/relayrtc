'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { getWebhookSignatureInfoAction } from '@/actions/webhooks'
import { AuthErrorMessage } from '@/components/auth/auth-error-message'
import { CopyButton } from '@/components/page/copy-button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { unavailableWebhookError, type WebhookError, type WebhookSignatureInfo } from '@/lib/webhooks/contracts'

const example = `import { verifyWebhookRequest } from '@relayrtc/protocol/webhook-signature'

const valid = verifyWebhookRequest(
  signingSecret,
  rawRequestBody,
  request.headers,
)

if (!valid) return new Response('Invalid signature', { status: 401 })`

export function SigningInfo({ projectId, environmentId }: { projectId: string; environmentId: string }) {
  const [info, setInfo] = useState<WebhookSignatureInfo | null>(null)
  const [error, setError] = useState<WebhookError | null>(null)
  useEffect(() => {
    let active = true
    void getWebhookSignatureInfoAction({ projectId, environmentId }).then((result) => {
      if (!active) return
      if (result.error) setError(result.error)
      else setInfo(result.data)
    }).catch(() => { if (active) setError(unavailableWebhookError) })
    return () => { active = false }
  }, [projectId, environmentId])

  return <>
    <DialogHeader><DialogTitle>Signing & retries</DialogTitle><DialogDescription>Verify deliveries before processing events in your application.</DialogDescription></DialogHeader>
    <AuthErrorMessage error={error} />
    {!info && !error ? <div className="flex items-center gap-2 py-6 text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" />Loading signing information…</div> : null}
    {info ? <div className="grid min-w-0 gap-5">
      <div className="grid gap-2 text-sm">
        <p>Signatures use {info.algorithm}. Verify the original body before parsing JSON, and accept timestamps only within {info.toleranceSeconds / 60} minutes of the current time.</p>
        <p className="text-muted-foreground">Keep your signing secret on your server. Save each event ID atomically with its processing result to prevent duplicate work.</p>
      </div>
      <dl className="grid gap-3 text-sm">
        {[
          ['Signature', info.signatureHeader], ['Delivery ID', info.deliveryIdHeader],
          ['Replay count', info.replayCountHeader], ['Signing key version', info.secretVersionHeader],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-xs">{value}</dd></div>)}
      </dl>
      <div className="grid gap-2">
        <div className="flex items-center justify-between"><h3 className="font-medium">Node receiver</h3><CopyButton value={example} label="Copy signature verification example" /></div>
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed">{example}</pre>
        <p className="text-xs text-muted-foreground">Pass your saved signing secret, the unmodified request body and the incoming headers to the verifier.</p>
      </div>
      <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Signature format</summary>
        <div className="mt-3 grid gap-2 break-words text-muted-foreground"><p>{info.signedContent}</p><code className="break-all text-xs">{info.signatureFormat}</code><p>{info.secretEncoding}</p></div>
      </details>
      <div className="grid gap-2 text-sm">
        <h3 className="font-medium">Delivery policy</h3>
        <p className="text-muted-foreground">Each run allows {info.attemptsPerRun} attempts over up to {info.maximumRunAgeDays} days. Network errors, HTTP 408, 425, 429 and 5xx responses are retried. Other HTTP errors stop the run.</p>
        <p className="text-muted-foreground">Retry delays: {info.backoffSeconds.map((seconds) => seconds >= 3600 ? `${seconds / 3600}h` : seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`).join(', ')}, with up to 20% additional jitter.</p>
        <p className="text-muted-foreground">Replay starts a fresh retry budget and retains the event and delivery IDs. Each delivery permits up to {info.maximumExplicitReplays} explicit replays.</p>
        <p className="text-muted-foreground">Completed delivery logs are retained for {info.terminalRetentionDays} days after their most recent outcome.</p>
      </div>
    </div> : null}
  </>
}
