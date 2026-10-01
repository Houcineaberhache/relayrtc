import { environmentTypes, projectStatuses, type Environment, type Project } from "@relaykit/types";
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
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
