import { CopyButton } from '@/components/page/copy-button'
import { SettingList, SettingRow } from '@/components/page/setting-row'
import type { ConsoleUser } from '@/lib/console-types'

export function ProfileSettings({ user }: { user: ConsoleUser }) {
  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="text-2xl font-normal tracking-tight">Account</h1><p className="mt-1 text-sm text-muted-foreground">Your authenticated RelayRTC account.</p></div>
      <SettingList>
        <SettingRow label="Name">{user.name}</SettingRow>
        <SettingRow label="Email">{user.email}</SettingRow>
        <SettingRow label="User ID"><span className="inline-flex items-center gap-1"><span className="break-all font-mono text-[0.8125rem]">{user.id}</span><CopyButton value={user.id} label="Copy user ID" /></span></SettingRow>
      </SettingList>
    </div>
  )
}
