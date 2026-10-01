import { AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"
import { getCurrentSession } from "@/lib/auth-session"
import {
  buildAuthHref,
  buildPostAuthRedirect,
  readAuthQuery,
  type RawSearchParams,
} from "@/lib/auth-query"
import { toOAuthCallbackError } from "@relaykit/auth"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Sign in" }
export const dynamic = "force-dynamic"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const query = readAuthQuery(await searchParams)
  const destination = buildPostAuthRedirect(query)
  const session = await getCurrentSession()

  if (session) redirect(destination)

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your RelayKit dashboard."
    >
      <LoginForm
        callbackURL={destination}
        errorCallbackURL={buildAuthHref("/auth/login", query)}
        initialError={toOAuthCallbackError(query.error ?? null)}
        signUpHref={buildAuthHref("/auth/signup", query)}
      />
    </AuthShell>
  )
}
