'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { PageHeader } from '@/components/page/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Domain = { name: string; verified: boolean }

export function OrgDomains() {
  const inputId = useId()
  const [domains, setDomains] = useState<Domain[]>([{ name: 'example.com', verified: true }])
  const [value, setValue] = useState('')

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const name = value.trim().toLowerCase()
    if (!name || domains.some((domain) => domain.name === name)) return
    setDomains((current) => [...current, { name, verified: false }])
    setValue('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Domains"
        description="Verify domains to auto-join teammates and enable single sign-on."
      />

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2 sm:max-w-sm">
          <Label htmlFor={inputId}>Add a domain</Label>
          <Input
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="company.com"
            className="h-11 rounded-xl bg-card"
          />
        </div>
        <Button type="submit" size="lg" disabled={!value.trim()}>
          <Plus />
          Add domain
        </Button>
      </form>

      <ul className="border-t">
        {domains.map((domain) => (
          <li key={domain.name} className="flex items-center justify-between gap-3 border-b py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="break-all text-[0.9375rem]">{domain.name}</span>
              <Badge variant={domain.verified ? 'secondary' : 'outline'}>
                {domain.verified ? 'Verified' : 'Pending DNS'}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${domain.name}`}
              onClick={() => setDomains((current) => current.filter((item) => item.name !== domain.name))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
