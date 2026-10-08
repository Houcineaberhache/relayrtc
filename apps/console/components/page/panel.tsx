import { cn } from '@/lib/utils'

export function Panel({
  className,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-2xl bg-card p-4 sm:p-5', className)}
      {...props}
    />
  )
}

export function PanelTitle({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-medium">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
