"use server"

import { getAuthRuntime } from "@/lib/auth-server"
import {
  createEnvironment,
  createProject,
  deleteEnvironment,
  deleteProject,
  getProjectDeletionImpact,
  updateEnvironment,
  updateProject,
} from "@/lib/projects/project-service"
import { projectError, type ProjectResult } from "@/lib/projects/project-errors"
import {
  createEnvironmentInputSchema,
  createProjectInputSchema,
  deleteEnvironmentInputSchema,
  deleteProjectInputSchema,
  updateEnvironmentInputSchema,
  updateProjectInputSchema,
  projectIdSchema,
} from "@relayrtc/validation"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

const getContext = async () => {
  const runtime = getAuthRuntime()
  const session = await runtime.auth.api.getSession({ headers: await headers() })

  return session
    ? { database: runtime.database, userId: session.user.id }
    : null
}

const sessionRequired = <T>(): ProjectResult<T> => ({
  data: null,
  error: projectError("PROJECT_ACCESS_DENIED"),
})

export async function createProjectAction(input: unknown) {
  const validation = createProjectInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_PROJECT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await createProject(context, validation.data)
  if (result.data) revalidatePath("/")
  return result
}

export async function updateProjectAction(input: unknown) {
  const validation = updateProjectInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_PROJECT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await updateProject(context, validation.data)
  if (result.data) revalidatePath(`/projects/${result.data.id}`)
  return result
}

export async function deleteProjectAction(input: unknown) {
  const validation = deleteProjectInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_PROJECT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await deleteProject(context, validation.data)
  if (result.data) revalidatePath("/")
  return result
}

export async function getProjectDeletionImpactAction(projectId: unknown) {
  const validation = projectIdSchema.safeParse(projectId)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_PROJECT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  return getProjectDeletionImpact(context, validation.data)
}

export async function updateEnvironmentAction(input: unknown) {
  const validation = updateEnvironmentInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_ENVIRONMENT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await updateEnvironment(context, validation.data)
  if (result.data) revalidatePath(`/projects/${result.data.projectId}`)
  return result
}

export async function createEnvironmentAction(input: unknown) {
  const validation = createEnvironmentInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_ENVIRONMENT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await createEnvironment(context, validation.data)
  if (result.data) revalidatePath(`/projects/${result.data.projectId}`)
  return result
}

export async function deleteEnvironmentAction(input: unknown) {
  const validation = deleteEnvironmentInputSchema.safeParse(input)
  if (!validation.success) {
    return { data: null, error: projectError("INVALID_ENVIRONMENT_INPUT") }
  }

  const context = await getContext()
  if (!context) return sessionRequired<never>()

  const result = await deleteEnvironment(context, validation.data)
  if (result.data) revalidatePath(`/projects/${result.data.projectId}`)
  return result
}

