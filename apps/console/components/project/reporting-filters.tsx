'use client'

import { useId, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SimpleSelect } from '@/components/page/simple-select'
import type { ConsoleEnvironment } from '@/lib/console-types'

export function ReportingFilters({ range, environment, environments }: {
  range: string
  environment?: string
  environments?: readonly ConsoleEnvironment[]
}) {
  const rangeId = useId()
  const environmentId = useId()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  function update(key: string, value: string) {
    const query = new URLSearchParams(searchParams.toString())
    query.set(key, value)
    query.delete('offset')
    startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }))
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3" aria-busy={pending}>
      <div className="flex items-center gap-2">
        <label htmlFor={rangeId} className="text-sm text-muted-foreground">Time range</label>
        <SimpleSelect id={rangeId} value={range} onValueChange={(value) => update('range', value)} size="sm"
          options={[{ value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '14d', label: 'Last 14 days' }, { value: '30d', label: 'Last 30 days' }]} />
      </div>
      {environments && (
        <div className="flex items-center gap-2">
          <label htmlFor={environmentId} className="text-sm text-muted-foreground">Environment</label>
          <SimpleSelect id={environmentId} value={environment ?? 'all'} onValueChange={(value) => update('environment', value)} size="sm"
            options={[{ value: 'all', label: 'All environments' }, ...environments.map((item) => ({ value: item.id, label: item.name }))]} />
        </div>
      )}
    </div>
  )
}
