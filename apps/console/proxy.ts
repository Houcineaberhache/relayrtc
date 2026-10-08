import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const login = new URL('/auth/login', request.url)
    login.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/console/:path*', '/org/:path*', '/invitations/:path*'],
}
