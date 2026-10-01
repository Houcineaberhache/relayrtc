"use client"

import { authClient } from "@/lib/auth-client"
import { Button } from "@relaykit/ui/components/button"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function LogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const signOut = async () => {
    setPending(true)
    await authClient.signOut()
    router.replace("/auth/login")
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={signOut} disabled={pending}>
      <LogOut />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
