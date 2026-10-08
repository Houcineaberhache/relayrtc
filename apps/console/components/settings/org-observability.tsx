'use client'

import { useId, useState } from 'react'
import { PageHeader } from '@/components/page/page-header'
import { SimpleSelect } from '@/components/page/simple-select'
import { ToggleRow } from '@/components/settings/toggle-row'

const retentionOptions = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

export function OrgObservability() {
  const retentionId = useId()
  const [sessionLogs, setSessionLogs] = useState(true)
  const [qualityMetrics, setQualityMetrics] = useState(true)
  const [alerts, setAlerts] = useState(false)
  const [retention, setRetention] = useState('30')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Observability" description="Choose what telemetry is collected across all projects." />
      <div className="border-t">
        <ToggleRow
          title="Session logs"
          description="Record join, leave and publish events for every session."
          checked={sessionLogs}
          onCheckedChange={setSessionLogs}
        />
        <ToggleRow
          title="Quality metrics"
          description="Collect round-trip time, jitter and packet loss samples."
          checked={qualityMetrics}
          onCheckedChange={setQualityMetrics}
        />
        <ToggleRow
          title="Email alerts"
          description="Get notified when connection success drops below 95%."
          checked={alerts}
          onCheckedChange={setAlerts}
        />
        <div className="flex items-center justify-between gap-6 border-b py-4">
          <label htmlFor={retentionId} className="text-[0.9375rem]">
            Log retention
          </label>
          <SimpleSelect
            id={retentionId}
            value={retention}
            onValueChange={setRetention}
            options={retentionOptions}
            size="sm"
            className="w-32"
          />
        </div>
      </div>
    </div>
  )
}
