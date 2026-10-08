import { CodeBlock } from '@/components/page/code-block'

const snippet = `import { RelayClient } from '@relayrtc/client'

// Connect to a room with a short-lived token
const room = new RelayClient({
  url: 'wss://rtc.example.com',
  apiKey: process.env.RELAY_API_KEY,
})

await room.join('standup', { audio: true, video: true })`

const stats = [
  { value: '<50ms', label: 'median join latency' },
  { value: '99.99%', label: 'uptime target' },
  { value: 'E2EE', label: 'optional per room' },
]

export function LoginShowcase() {
  return (
    <aside className="hidden flex-col justify-between bg-muted/60 p-10 lg:flex xl:p-14">
      <div className="max-w-md">
        <h2 className="text-balance text-3xl font-normal tracking-tight xl:text-4xl">
          Realtime audio and video, without the plumbing.
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground">
          Create projects, issue API keys, split environments and watch usage in one console.
        </p>
      </div>

      <CodeBlock code={snippet} language="typescript" className="max-w-xl" />

      <dl className="grid max-w-xl grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="sr-only">{stat.label}</dt>
            <dd className="text-2xl font-normal tracking-tight">{stat.value}</dd>
            <p className="text-xs text-muted-foreground" aria-hidden="true">
              {stat.label}
            </p>
          </div>
        ))}
      </dl>
    </aside>
  )
}
