'use client'

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { toAuthError, type AuthError, type OAuthProvider } from '@relayrtc/auth'
import { Button } from '@/components/ui/button'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10.1 10.1 0 0 0 12 22" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10.1 10.1 0 0 0 0 9.2z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.1 10.1 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 5.9" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.9 0C15 4.7 16 5 16 5c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.8 5.5-5.5 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7" />
    </svg>
  )
}

export function OAuthButtons({ callbackURL, errorCallbackURL, onError }: {
  callbackURL: string
  errorCallbackURL: string
  onError: (error: AuthError | null) => void
}) {
  const [pending, setPending] = useState<OAuthProvider | null>(null)

  async function signIn(provider: OAuthProvider) {
    setPending(provider)
    onError(null)
    const result = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL })
    if (result.error) {
      onError(toAuthError(result.error))
      setPending(null)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => signIn('github')} disabled={pending !== null}>
        {pending === 'github' ? <LoaderCircle className="animate-spin" /> : <GitHubIcon />} GitHub
      </Button>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => signIn('google')} disabled={pending !== null}>
        {pending === 'google' ? <LoaderCircle className="animate-spin" /> : <GoogleIcon />} Google
      </Button>
    </div>
  )
}
