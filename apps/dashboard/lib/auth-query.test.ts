import { describe, expect, it } from "vitest"

import {
  buildAuthHref,
  buildPostAuthRedirect,
  readAuthQuery,
} from "./auth-query"

describe("auth query handling", () => {
  it("keeps local redirects and tracking parameters", () => {
    const query = readAuthQuery({
      redirect: "/projects/new?template=realtime",
      utm_campaign: "launch",
      utm_source: "docs",
    })

    expect(buildPostAuthRedirect(query)).toBe(
      "/projects/new?template=realtime&utm_source=docs&utm_campaign=launch"
    )
    expect(buildAuthHref("/auth/signup", query)).toContain(
      "redirect=%2Fprojects%2Fnew"
    )
  })

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "rejects an unsafe redirect: %s",
    (redirect) => {
      expect(readAuthQuery({ redirect }).redirect).toBe("/")
    }
  )

  it("uses the first value when a query parameter is repeated", () => {
    expect(readAuthQuery({ redirect: ["/first", "/second"] }).redirect).toBe(
      "/first"
    )
  })
})
