import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth-session'
import { buildPostAuthRedirect, readAuthQuery, type RawSearchParams } from '@/lib/auth-query'

export const dynamic = 'force-dynamic'

export default async function ContinuePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = readAuthQuery(await searchParams)
  const destination = buildPostAuthRedirect(query)
  const session = await getCurrentSession()
  if (!session) redirect(`/auth/login?redirect=${encodeURIComponent(destination)}`)
  redirect(destination)
}
