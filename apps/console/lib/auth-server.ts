import { createRelayKitAuthFromEnvironment } from "@relayrtc/auth"

type AuthRuntime = ReturnType<typeof createRelayKitAuthFromEnvironment>

const globalAuth = globalThis as typeof globalThis & {
  relayKitAuthRuntime?: AuthRuntime
}

export const getAuthRuntime = (): AuthRuntime => {
  if (!globalAuth.relayKitAuthRuntime) {
    globalAuth.relayKitAuthRuntime = createRelayKitAuthFromEnvironment(
      process.env
    )
  }

  return globalAuth.relayKitAuthRuntime
}
