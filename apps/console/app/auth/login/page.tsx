import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { LoginShowcase } from '@/components/auth/login-showcase'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { getCurrentSession } from '@/lib/auth-session'
import { buildAuthHref, buildPostAuthRedirect, readAuthQuery, type RawSearchParams } from '@/lib/auth-query'
import { toOAuthCallbackError } from '@relayrtc/auth'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = readAuthQuery(await searchParams)
  const destination = buildPostAuthRedirect(query)
  const session = await getCurrentSession()
  if (session) redirect(destination)

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="absolute right-3 top-3 sm:right-6 sm:top-6"><ThemeToggle /></div>
        <div className="flex flex-1 items-center justify-center py-10">
          <LoginForm callbackURL={destination} errorCallbackURL={buildAuthHref('/auth/login', query)} initialError={toOAuthCallbackError(query.error ?? null)} signUpHref={buildAuthHref('/auth/signup', query)} />
        </div>
        <p className="text-center text-xs text-muted-foreground">By continuing you agree to the Terms of Service and Privacy Policy.</p>
      </div>
      <LoginShowcase />
    </div>
  )
}
