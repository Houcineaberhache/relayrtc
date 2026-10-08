import { CopyButton } from '@/components/page/copy-button'
import { cn } from '@/lib/utils'

const TOKEN_PATTERN =
  /((?<!:)\/\/.*$|^\s*#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(process\.env\.[A-Z_]+|\$[A-Z_]+|os\.environ\[[^\]]+\])/gm

function highlight(code: string) {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(code.slice(lastIndex, index))
    const [text, comment, string] = match
    const className = comment
      ? 'text-muted-foreground'
      : string
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'
    nodes.push(
      <span key={key++} className={className}>
        {text}
      </span>,
    )
    lastIndex = index + text.length
  }
  if (lastIndex < code.length) nodes.push(code.slice(lastIndex))
  return nodes
}

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string
  language?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-background', className)}>
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="font-mono text-xs text-muted-foreground">{language}</span>
        <CopyButton value={code} label="Copy code" />
      </div>
      <pre className="overflow-x-auto px-4 pb-4 pt-1 font-mono text-[0.8125rem] leading-6">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}
