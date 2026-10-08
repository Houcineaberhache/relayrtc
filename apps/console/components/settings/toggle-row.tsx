'use client'

import { useId } from 'react'
import { Switch } from '@/components/ui/switch'

export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-6 border-b py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.9375rem]">
          {title}
        </label>
        <p className="mt-0.5 text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
