'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/components/page/copy-button'
import { PageHeader } from '@/components/page/page-header'
import { Button } from '@/components/ui/button'
import { randomId, randomToken } from '@/lib/format'

type ManagementKey = { id: string; name: string; secret: string | null; preview: string; createdAt: string }

export function OrgManagementKeys() {
  const [keys, setKeys] = useState<ManagementKey[]>([
    { id: 'mk_1', name: 'CI deploy', secret: null, preview: 'mgmt-…x91P', createdAt: 'Oct 2, 2026' },
  ])

  function handleCreate() {
    const secret = `mgmt-${randomToken(36)}`
    setKeys((current) => [
      {
        id: randomId('mk', 6),
        name: `Management key ${current.length + 1}`,
        secret,
        preview: `mgmt-…${secret.slice(-4)}`,
        createdAt: 'Today',
      },
      ...current,
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Management keys"
        description="Programmatic access to manage projects, keys and members."
        actions={
          <Button size="lg" onClick={handleCreate}>
            <Plus />
            Create key
          </Button>
        }
      />
      <ul className="border-t">
        {keys.map((key) => (
          <li key={key.id} className="flex flex-col gap-2 border-b py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9375rem]">{key.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <span className="font-mono text-[0.8125rem]">{key.preview}</span> · Created {key.createdAt}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${key.name}`}
                onClick={() => setKeys((current) => current.filter((item) => item.id !== key.id))}
              >
                <Trash2 />
              </Button>
            </div>
            {key.secret ? (
              <div className="flex items-center gap-1 rounded-xl border bg-muted/50 py-1.5 pl-3 pr-1.5">
                <code className="min-w-0 flex-1 break-all font-mono text-[0.8125rem]">{key.secret}</code>
                <CopyButton value={key.secret} label="Copy management key" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
