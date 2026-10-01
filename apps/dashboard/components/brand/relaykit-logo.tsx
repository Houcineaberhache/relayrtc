import { RadioTower } from "lucide-react"

export function RelayKitLogo() {
  return (
    <div className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
        <RadioTower className="size-4" />
      </span>
      <span>RelayKit</span>
    </div>
  )
}
