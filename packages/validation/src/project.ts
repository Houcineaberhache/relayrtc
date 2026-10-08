import { environmentTypes, projectStatuses, type Environment, type Project } from "@relayrtc/types";
import { z } from "zod";

import {
  environmentIdSchema,
  isoDateTimeSchema,
  nameSchema,
  organizationIdSchema,
  projectIdSchema,
  slugSchema,
} from "./common.js";

export const projectStatusSchema = z.enum(projectStatuses);
export const environmentTypeSchema = z.enum(environmentTypes);

export const projectSlugFromName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/gu, "");

export const createProjectInputSchema = z
  .object({
    name: nameSchema,
    organizationId: organizationIdSchema,
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: nameSchema,
    projectId: projectIdSchema,
  })
  .strict();

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const deleteProjectInputSchema = z
  .object({
    confirmationName: z.string().trim().min(1).max(120),
    projectId: projectIdSchema,
  })
  .strict();

export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;

export const createEnvironmentInputSchema = z
  .object({
    deletionProtected: z.boolean(),
    name: nameSchema,
    projectId: projectIdSchema,
    slug: slugSchema,
    type: z.enum(["preview", "staging", "custom"]),
  })
  .strict();

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentInputSchema>;

export const updateEnvironmentInputSchema = z
  .object({
    deletionProtected: z.boolean(),
    environmentId: environmentIdSchema,
    name: nameSchema,
    projectId: projectIdSchema,
    slug: slugSchema,
  })
  .strict();

export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentInputSchema>;

export const deleteEnvironmentInputSchema = z
  .object({
    environmentId: environmentIdSchema,
    projectId: projectIdSchema,
  })
  .strict();

export type DeleteEnvironmentInput = z.infer<typeof deleteEnvironmentInputSchema>;

export const projectSchema: z.ZodType<Project> = z
  .object({
    id: projectIdSchema,
    organizationId: organizationIdSchema,
    name: nameSchema,
    slug: slugSchema,
    status: projectStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const environmentSchema: z.ZodType<Environment> = z
  .object({
    id: environmentIdSchema,
    projectId: projectIdSchema,
    name: nameSchema,
    slug: slugSchema,
    type: environmentTypeSchema,
    deletionProtected: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
