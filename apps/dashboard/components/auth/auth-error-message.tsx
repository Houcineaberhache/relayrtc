import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@relayrtc/ui/components/alert"
import { CircleAlert } from "lucide-react"

interface DisplayError {
  readonly code: string
  readonly description: string
}

export function AuthErrorMessage({ error }: { error: DisplayError | null }) {
  if (!error) return null

  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{error.code}</AlertTitle>
      <AlertDescription>{error.description}</AlertDescription>
    </Alert>
  )
}
