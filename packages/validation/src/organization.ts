import {
  organizationMemberRoles,
  type Organization,
  type OrganizationMembership,
} from "@relaykit/types";
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
