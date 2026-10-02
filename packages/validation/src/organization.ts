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
export const organizationInvitationRoleSchema = z.enum([
  "admin",
  "developer",
  "viewer",
]);

export const organizationInvitationIdSchema = z.string().trim().min(1).max(128);

export const inviteOrganizationMemberInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(320)
      .pipe(z.email())
      .transform((email) => email.toLowerCase()),
    organizationId: organizationIdSchema,
    role: organizationInvitationRoleSchema,
  })
  .strict();

export type InviteOrganizationMemberInput = z.infer<
  typeof inviteOrganizationMemberInputSchema
>;

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
