import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Panel } from '@/components/page/panel'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  hint,
  delta,
  invertDelta,
  children,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  delta?: number
  invertDelta?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const positive = delta !== undefined && (invertDelta ? delta < 0 : delta > 0)

  return (
    <Panel className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-normal tracking-tight tabular-nums sm:text-[1.75rem]">{value}</p>
        {delta !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs tabular-nums',
              positive ? 'text-success' : 'text-destructive',
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
      </div>
      {children}
    </Panel>
  )
}

export function MiniBars({
  values,
  label,
  className,
}: {
  values: number[]
  label: string
  className?: string
}) {
  const max = Math.max(...values, 1)
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('mt-3 flex h-14 items-end gap-1', className)}
    >
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-t-sm bg-chart-1/70"
          style={{ height: `${Math.max((value / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  )
}
