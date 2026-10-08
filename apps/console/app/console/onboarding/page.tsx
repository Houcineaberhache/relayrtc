import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { OnboardingForm } from '@/components/auth/onboarding-form'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { getCurrentSession } from '@/lib/auth-session'

export const metadata: Metadata = { title: 'Create your organization' }
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/auth/login?redirect=%2Fconsole%2Fonboarding')

  return (
    <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-8">
      <header className="flex items-center justify-between"><Logo /><ThemeToggle /></header>
      <div className="flex flex-1 items-center justify-center py-10"><OnboardingForm /></div>
    </div>
  )
}
