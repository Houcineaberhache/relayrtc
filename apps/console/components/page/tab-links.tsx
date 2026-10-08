import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabItem = { value: string; label: string }

export function TabLinks({
  items,
  active,
  basePath,
  label,
}: {
  items: TabItem[]
  active: string
  basePath: string
  label: string
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1">
        {items.map((item) => {
          const isActive = item.value === active
          return (
            <li key={item.value}>
              <Link
                href={`${basePath}?tab=${item.value}`}
                aria-current={isActive ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors',
                  isActive
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
