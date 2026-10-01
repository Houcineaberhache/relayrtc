import type { AuthError } from "@relayrtc/auth"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@relayrtc/ui/components/alert"
import { CircleAlert } from "lucide-react"

export function AuthErrorMessage({ error }: { error: AuthError | null }) {
  if (!error) return null

  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{error.code}</AlertTitle>
      <AlertDescription>{error.description}</AlertDescription>
    </Alert>
  )
}
