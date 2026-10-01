import { RelayKitLogo } from "@/components/brand/relayrtc-logo"
import { LogoutButton } from "@/components/dashboard/logout-button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@relayrtc/ui/components/avatar"
import { Building2 } from "lucide-react"

interface DashboardHeaderProps {
  activeOrganization?: {
    name: string
  } | undefined
  user: {
    email: string
    image?: string | null | undefined
    name: string
  }
}

export function DashboardHeader({
  activeOrganization,
  user,
}: DashboardHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <RelayKitLogo />
          <div className="hidden min-w-0 items-center gap-2 border-l pl-4 md:flex">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">
              {activeOrganization?.name ?? "No active organization"}
            </span>
          </div>
        </div>
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
