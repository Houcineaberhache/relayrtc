import { describe, expect, it } from "vitest"

import { canManageProjects } from "./project-service"

describe("project management policy", () => {
  it.each(["owner", "admin", "viewer,owner"])(
    "allows the %s role to manage projects",
    (role) => {
      expect(canManageProjects(role)).toBe(true)
    }
  )

  it.each(["developer", "viewer"])(
    "keeps the %s role read-only",
    (role) => {
      expect(canManageProjects(role)).toBe(false)
    }
  )
})
