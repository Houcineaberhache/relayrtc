import { RelayKitLogo } from "@/components/brand/relaykit-logo"
import { Card, CardContent, CardHeader } from "@relaykit/ui/components/card"
import Link from "next/link"
import type { ReactNode } from "react"

interface AuthShellProps {
  children: ReactNode
  description: string
  title: string
}

export function AuthShell({ children, description, title }: AuthShellProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit"
          aria-label="RelayKit dashboard"
        >
          <RelayKitLogo />
        </Link>
        <Card>
          <CardHeader className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to RelayKit&apos;s terms and privacy policy.
        </p>
      </div>
    </main>
  )
}
