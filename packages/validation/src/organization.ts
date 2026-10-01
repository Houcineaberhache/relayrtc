import {
  organizationMemberRoles,
  type Organization,
  type OrganizationMembership,
} from "@relayrtc/types";
import { z } from "zod";

import {
  isoDateTimeSchema,
  membershipIdSchema,
  nameSchema,
  organizationIdSchema,
  slugSchema,
  userIdSchema,
} from "./common.js";

export const organizationMemberRoleSchema = z.enum(organizationMemberRoles);

export const createOrganizationInputSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema,
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const updateOrganizationInputSchema = createOrganizationInputSchema.extend({
  organizationId: organizationIdSchema,
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>;

export const organizationSlugFromName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/gu, "");

export const organizationSchema: z.ZodType<Organization> = z
  .object({
    id: organizationIdSchema,
    name: nameSchema,
    slug: slugSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const organizationMembershipSchema: z.ZodType<OrganizationMembership> = z
  .object({
    id: membershipIdSchema,
    organizationId: organizationIdSchema,
    userId: userIdSchema,
    role: organizationMemberRoleSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
