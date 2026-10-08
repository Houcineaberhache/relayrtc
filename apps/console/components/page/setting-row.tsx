import { cn } from '@/lib/utils'

export function SettingList({
  className,
  ...props
}: React.ComponentProps<'dl'>) {
  return <dl className={cn('border-t', className)} {...props} />
}

export function SettingRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-16 flex-col justify-center gap-1 border-b py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        className,
      )}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm sm:text-right">{children}</dd>
    </div>
  )
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 pb-3">
      <h2 className="text-lg font-medium tracking-tight">{children}</h2>
      {action}
    </div>
  )
}
