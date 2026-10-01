"use client"

import { AuthErrorMessage } from "@/components/auth/auth-error-message"
import { OAuthButtons } from "@/components/auth/oauth-buttons"
import { PasswordInput } from "@/components/auth/password-input"
import { authClient } from "@/lib/auth-client"
import type { AuthError } from "@relayrtc/auth"
import { toAuthError, validateSignInCredentials } from "@relayrtc/auth"
import { Button } from "@relayrtc/ui/components/button"
import { Input } from "@relayrtc/ui/components/input"
import { Label } from "@relayrtc/ui/components/label"
import { Separator } from "@relayrtc/ui/components/separator"
import { LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

interface LoginFormProps {
  callbackURL: string
  errorCallbackURL: string
  initialError: AuthError | null
  signUpHref: string
}

export function LoginForm({
  callbackURL,
  errorCallbackURL,
  initialError,
  signUpHref,
}: LoginFormProps) {
  const router = useRouter()
  const [error, setError] = useState<AuthError | null>(initialError)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const validation = validateSignInCredentials({
      email: form.get("email"),
      password: form.get("password"),
    })

    if (!validation.success) {
      setError(validation.error)
      return
    }

    setPending(true)
    const result = await authClient.signIn.email(validation.data)

    if (result.error) {
      setError(toAuthError(result.error))
      setPending(false)
      return
    }

    router.replace(callbackURL)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <OAuthButtons
        callbackURL={callbackURL}
        errorCallbackURL={errorCallbackURL}
        onError={setError}
      />
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">
          OR CONTINUE WITH EMAIL
        </span>
        <Separator className="flex-1" />
      </div>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <AuthErrorMessage error={error} />
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            required
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to RelayRTC?{" "}
        <Link
          href={signUpHref}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </div>
  )
}
