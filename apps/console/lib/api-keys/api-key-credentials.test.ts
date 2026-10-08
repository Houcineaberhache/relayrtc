import { describe, expect, it } from "vitest"

import {
  apiKeyHashMatches,
  apiKeyPrefixFromRaw,
  generateApiKey,
} from "./api-key-credentials"

describe("API key credentials", () => {
  it("generates environment-aware publishable and secret keys", () => {
    const publishable = generateApiKey("publishable", "development")
    const secret = generateApiKey("secret", "production")

    expect(publishable.rawKey).toMatch(/^rk_pk_dev_/u)
    expect(secret.rawKey).toMatch(/^rk_sk_live_/u)
    expect(publishable.rawKey).not.toBe(publishable.hashedSecret)
    expect(apiKeyPrefixFromRaw(secret.rawKey)).toBe(secret.prefix)
  })

  it("compares hashed credentials without storing the raw key", () => {
    const credential = generateApiKey("secret", "development")

    expect(apiKeyHashMatches(credential.rawKey, credential.hashedSecret)).toBe(true)
    expect(apiKeyHashMatches(`${credential.rawKey}x`, credential.hashedSecret)).toBe(false)
  })
})
