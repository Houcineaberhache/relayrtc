import { AuthShell } from "@/components/auth/auth-shell"
import { SignupForm } from "@/components/auth/signup-form"
import { getCurrentSession } from "@/lib/auth-session"
import {
  buildAuthHref,
  buildPostAuthRedirect,
  readAuthQuery,
  type RawSearchParams,
} from "@/lib/auth-query"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Create account" }
export const dynamic = "force-dynamic"

export default async function SignupPage({
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
      title="Create your account"
      description="Start building realtime experiences with RelayRTC."
    >
      <SignupForm
        callbackURL={destination}
        errorCallbackURL={buildAuthHref("/auth/login", query)}
        loginHref={buildAuthHref("/auth/login", query)}
      />
    </AuthShell>
  )
}
