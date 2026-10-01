import { getAuthRuntime } from "@/lib/auth-server"
import { headers } from "next/headers"

export const getCurrentSession = async () =>
  getAuthRuntime().auth.api.getSession({
    headers: await headers(),
  })

export const getCurrentOrganizations = async () =>
  getAuthRuntime().auth.api.listOrganizations({
    headers: await headers(),
  })
