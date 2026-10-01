import { RelayKitLogo } from "@/components/brand/relayrtc-logo"
import { LogoutButton } from "@/components/dashboard/logout-button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@relayrtc/ui/components/avatar"

interface DashboardHeaderProps {
  user: {
    email: string
    image?: string | null | undefined
    name: string
  }
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <RelayKitLogo />
        <div className="flex items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Avatar>
            {user.image ? (
              <AvatarImage src={user.image} alt={user.name} />
            ) : null}
            <AvatarFallback>
              {user.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
