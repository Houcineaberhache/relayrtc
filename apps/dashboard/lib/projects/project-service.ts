import type { RelayKitDatabase } from "@relayrtc/database"
import { schema } from "@relayrtc/database"
import type {
  CreateProjectInput,
  DeleteProjectInput,
  UpdateEnvironmentInput,
  UpdateProjectInput,
} from "@relayrtc/validation"
import { and, asc, desc, eq } from "drizzle-orm"

import {
  projectError,
  type ProjectErrorCode,
  type ProjectResult,
} from "./project-errors"

export type ProjectRecord = typeof schema.project.$inferSelect
export type EnvironmentRecord = typeof schema.environment.$inferSelect

export interface ProjectDetails {
  canManage: boolean
  environments: EnvironmentRecord[]
  project: ProjectRecord
}

interface ProjectServiceContext {
  database: RelayKitDatabase
  userId: string
}

type RelayKitTransaction = Parameters<
  Parameters<RelayKitDatabase["transaction"]>[0]
>[0]

const managementRoles = new Set(["owner", "admin"])

export const canManageProjects = (role: string): boolean =>
  role.split(",").some((value) => managementRoles.has(value.trim()))

const failure = <T>(code: ProjectErrorCode): ProjectResult<T> => ({
  data: null,
  error: projectError(code),
})

const success = <T>(data: T): ProjectResult<T> => ({ data, error: null })

const readErrorProperty = (error: unknown, property: string): string | undefined => {
  if (typeof error !== "object" || error === null || !(property in error)) {
    return undefined
  }

  const value = (error as Record<string, unknown>)[property]
  return typeof value === "string" ? value : undefined
}

const isUniqueViolation = (error: unknown, constraint: string): boolean =>
  readErrorProperty(error, "code") === "23505" &&
  readErrorProperty(error, "constraint_name") === constraint

const getLockedMembership = async (
  transaction: RelayKitTransaction,
  organizationId: string,
  userId: string
) => {
  const [membership] = await transaction
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, userId)
      )
    )
    .for("share")

  return membership
}

const getLockedProject = async (
  transaction: RelayKitTransaction,
  projectId: string
) => {
  const [project] = await transaction
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .for("update")

  return project
}

export const listOrganizationProjects = async (
  { database, userId }: ProjectServiceContext,
  organizationId: string
): Promise<ProjectResult<ProjectRecord[]>> => {
  return database.transaction(async (transaction) => {
    const membership = await getLockedMembership(
      transaction,
      organizationId,
      userId
    )

    if (!membership) return failure("PROJECT_ACCESS_DENIED")

    const projects = await transaction
      .select()
      .from(schema.project)
      .where(eq(schema.project.organizationId, organizationId))
      .orderBy(desc(schema.project.createdAt))

    return success(projects)
  })
}

export const getProjectDetails = async (
  { database, userId }: ProjectServiceContext,
  projectId: string
): Promise<ProjectResult<ProjectDetails>> => {
  return database.transaction(async (transaction) => {
    const project = await getLockedProject(transaction, projectId)

    if (!project) return failure("PROJECT_NOT_FOUND")

    const membership = await getLockedMembership(
      transaction,
      project.organizationId,
      userId
    )

    if (!membership) return failure("PROJECT_ACCESS_DENIED")

    const environments = await transaction
      .select()
      .from(schema.environment)
      .where(eq(schema.environment.projectId, project.id))
      .orderBy(asc(schema.environment.createdAt))

    return success({
      canManage: canManageProjects(membership.role),
      environments,
      project,
    })
  })
}

export const createProject = async (
  { database, userId }: ProjectServiceContext,
  input: CreateProjectInput
): Promise<ProjectResult<ProjectRecord>> => {
  try {
    return await database.transaction(async (transaction) => {
      const membership = await getLockedMembership(
        transaction,
        input.organizationId,
        userId
      )

      if (!membership || !canManageProjects(membership.role)) {
        return failure("PROJECT_MANAGEMENT_FORBIDDEN")
      }

      const now = new Date()
      const [project] = await transaction
        .insert(schema.project)
        .values({
          id: `project_${crypto.randomUUID()}`,
          name: input.name,
          organizationId: input.organizationId,
          slug: input.slug,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!project) return failure("PROJECT_CREATION_FAILED")

      await transaction.insert(schema.environment).values([
        {
          id: `environment_${crypto.randomUUID()}`,
          name: "Development",
          projectId: project.id,
          slug: "development",
          type: "development",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `environment_${crypto.randomUUID()}`,
          name: "Production",
          projectId: project.id,
          slug: "production",
          type: "production",
          createdAt: now,
          updatedAt: now,
        },
      ])

      return success(project)
    })
  } catch (error) {
    return failure(
      isUniqueViolation(error, "project_organization_slug_idx")
        ? "PROJECT_SLUG_TAKEN"
        : "PROJECT_CREATION_FAILED"
    )
  }
}

export const updateProject = async (
  { database, userId }: ProjectServiceContext,
  input: UpdateProjectInput
): Promise<ProjectResult<ProjectRecord>> => {
  try {
    return await database.transaction(async (transaction) => {
      const project = await getLockedProject(transaction, input.projectId)

      if (!project) return failure("PROJECT_NOT_FOUND")

      const membership = await getLockedMembership(
        transaction,
        project.organizationId,
        userId
      )

      if (!membership || !canManageProjects(membership.role)) {
        return failure("PROJECT_MANAGEMENT_FORBIDDEN")
      }

      const [updatedProject] = await transaction
        .update(schema.project)
        .set({ name: input.name, slug: input.slug, updatedAt: new Date() })
        .where(eq(schema.project.id, project.id))
        .returning()

      return updatedProject
        ? success(updatedProject)
        : failure("PROJECT_UPDATE_FAILED")
    })
  } catch (error) {
    return failure(
      isUniqueViolation(error, "project_organization_slug_idx")
        ? "PROJECT_SLUG_TAKEN"
        : "PROJECT_UPDATE_FAILED"
    )
  }
}

export const deleteProject = async (
  { database, userId }: ProjectServiceContext,
  input: DeleteProjectInput
): Promise<ProjectResult<{ projectId: string }>> => {
  try {
    return await database.transaction(async (transaction) => {
      const project = await getLockedProject(transaction, input.projectId)

      if (!project) return failure("PROJECT_NOT_FOUND")

      const membership = await getLockedMembership(
        transaction,
        project.organizationId,
        userId
      )

      if (!membership || !canManageProjects(membership.role)) {
        return failure("PROJECT_MANAGEMENT_FORBIDDEN")
      }

      if (input.confirmationName !== project.name) {
        return failure("PROJECT_CONFIRMATION_MISMATCH")
      }

      await transaction
        .update(schema.project)
        .set({ status: "deleting", updatedAt: new Date() })
        .where(eq(schema.project.id, project.id))
      await transaction
        .delete(schema.environment)
        .where(eq(schema.environment.projectId, project.id))
      await transaction.delete(schema.project).where(eq(schema.project.id, project.id))

      return success({ projectId: project.id })
    })
  } catch {
    return failure("PROJECT_DELETION_FAILED")
  }
}

export const updateEnvironment = async (
  { database, userId }: ProjectServiceContext,
  input: UpdateEnvironmentInput
): Promise<ProjectResult<EnvironmentRecord>> => {
  try {
    return await database.transaction(async (transaction) => {
      const project = await getLockedProject(transaction, input.projectId)

      if (!project) return failure("PROJECT_NOT_FOUND")

      const membership = await getLockedMembership(
        transaction,
        project.organizationId,
        userId
      )

      if (!membership || !canManageProjects(membership.role)) {
        return failure("PROJECT_MANAGEMENT_FORBIDDEN")
      }

      const [environment] = await transaction
        .update(schema.environment)
        .set({ name: input.name, slug: input.slug, updatedAt: new Date() })
        .where(
          and(
            eq(schema.environment.id, input.environmentId),
            eq(schema.environment.projectId, project.id)
          )
        )
        .returning()

      return environment
        ? success(environment)
        : failure("ENVIRONMENT_NOT_FOUND")
    })
  } catch (error) {
    return failure(
      isUniqueViolation(error, "environment_project_slug_idx")
        ? "ENVIRONMENT_SLUG_TAKEN"
        : "ENVIRONMENT_UPDATE_FAILED"
    )
  }
}

