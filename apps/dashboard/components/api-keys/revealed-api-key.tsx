"use client"

import { Button } from "@relayrtc/ui/components/button"
import { Check, Copy, KeyRound } from "lucide-react"
import { useState } from "react"

export function RevealedApiKey({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(rawKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 text-amber-700 dark:text-amber-300" />
        <div>
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Copy this key now
          </p>
          <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
            RelayRTC stores only its hash. This value cannot be shown again.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 text-xs">
          {rawKey}
        </code>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  )
}
