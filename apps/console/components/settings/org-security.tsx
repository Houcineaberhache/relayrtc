'use client'

import { useId, useState } from 'react'
import { PageHeader } from '@/components/page/page-header'
import { SimpleSelect } from '@/components/page/simple-select'
import { ToggleRow } from '@/components/settings/toggle-row'

const timeoutOptions = [
  { value: '1', label: '1 hour' },
  { value: '8', label: '8 hours' },
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
]

export function OrgSecurity() {
  const timeoutId = useId()
  const [requireMfa, setRequireMfa] = useState(false)
  const [sso, setSso] = useState(false)
  const [allowlist, setAllowlist] = useState(false)
  const [timeout, setTimeoutValue] = useState('24')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Control how members sign in and how keys can be used." />
      <div className="border-t">
        <ToggleRow
          title="Require two-factor authentication"
          description="Members must enable 2FA before they can access this organization."
          checked={requireMfa}
          onCheckedChange={setRequireMfa}
        />
        <ToggleRow
          title="Single sign-on (SAML)"
          description="Let members sign in with your identity provider."
          checked={sso}
          onCheckedChange={setSso}
        />
        <ToggleRow
          title="IP allowlist for API keys"
          description="Only accept token requests from approved IP ranges."
          checked={allowlist}
          onCheckedChange={setAllowlist}
        />
        <div className="flex items-center justify-between gap-6 border-b py-4">
          <label htmlFor={timeoutId} className="text-[0.9375rem]">
            Session timeout
          </label>
          <SimpleSelect
            id={timeoutId}
            value={timeout}
            onValueChange={setTimeoutValue}
            options={timeoutOptions}
            size="sm"
            className="w-36"
          />
        </div>
      </div>
    </div>
  )
}
