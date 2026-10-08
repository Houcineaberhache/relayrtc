'use client'

import { ArrowUpRight, Boxes, Globe, Server, Terminal } from 'lucide-react'
import { useState } from 'react'
import { CodeBlock } from '@/components/page/code-block'
import { cn } from '@/lib/utils'

const snippets = [
  {
    value: 'server',
    label: 'Server',
    icon: Server,
    language: 'typescript',
    code: `import { RelayServer } from '@relayrtc/server'

const relay = new RelayServer({ apiKey: process.env.RELAY_API_KEY })

// Mint a short-lived token for a participant
const token = await relay.createToken({
  room: 'standup',
  identity: 'alice',
  ttl: '10m',
})`,
  },
  {
    value: 'web',
    label: 'Web client',
    icon: Globe,
    language: 'typescript',
    code: `import { RelayClient } from '@relayrtc/client'

const room = new RelayClient({ url: 'wss://rtc.example.com' })

await room.join('standup', { token, audio: true, video: true })
room.on('participantJoined', (p) => console.log(p.identity))`,
  },
  {
    value: 'react',
    label: 'React',
    icon: Boxes,
    language: 'tsx',
    code: `import { RelayRoom, VideoGrid } from '@relayrtc/react'

export function Call({ token }: { token: string }) {
  return (
    <RelayRoom url="wss://rtc.example.com" token={token} audio video>
      <VideoGrid />
    </RelayRoom>
  )
}`,
  },
  {
    value: 'curl',
    label: 'cURL',
    icon: Terminal,
    language: 'bash',
    code: `curl https://api.example.com/v1/rooms \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "name": "standup",
    "max_participants": 50
  }'`,
  },
]

export function QuickstartTabs() {
  const defaultSnippet = snippets[0]!
  const [active, setActive] = useState(defaultSnippet.value)
  const current = snippets.find((snippet) => snippet.value === active) ?? defaultSnippet

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b p-1.5">
        <div role="tablist" aria-label="Quickstart language" className="flex gap-1 overflow-x-auto">
          {snippets.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`quickstart-tab-${value}`}
              aria-selected={active === value}
              aria-controls="quickstart-panel"
              onClick={() => setActive(value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                active === value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden shrink-0 items-center gap-1 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          View docs
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      <div id="quickstart-panel" role="tabpanel" aria-labelledby={`quickstart-tab-${active}`}>
        <CodeBlock
          code={current.code}
          language={current.language}
          className="rounded-none border-0"
        />
      </div>
    </div>
  )
}
