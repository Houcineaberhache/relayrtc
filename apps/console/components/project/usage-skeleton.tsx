import { Panel } from '@/components/page/panel'
import { Skeleton } from '@/components/ui/skeleton'

export function UsageSkeleton() {
  return (
    <div role="status" aria-label="Loading usage" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <div className="flex gap-4"><Skeleton className="h-9 w-44 rounded-full" /><Skeleton className="h-9 w-40 rounded-full" /></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel><Skeleton className="h-4 w-36" /><Skeleton className="mt-3 h-8 w-24" /><Skeleton className="mt-4 h-64 w-full sm:h-72" /></Panel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1].map((item) => <Panel key={item}><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-8 w-20" /><Skeleton className="mt-3 h-16 w-full" /></Panel>)}
        </div>
      </div>
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Panel key={item}><Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-8 w-28" /></Panel>)}
      </div>
      <Skeleton className="h-6 w-32" />
      <div className="flex gap-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-9 w-24 rounded-full" />)}</div>
      <Panel><Skeleton className="h-28 w-full" /></Panel>
    </div>
  )
}
