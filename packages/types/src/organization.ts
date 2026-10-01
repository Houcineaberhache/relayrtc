import type { IsoDateTime, MembershipId, OrganizationId, UserId } from "./common.js";

export const organizationMemberRoles = ["owner", "admin", "developer", "viewer"] as const;

export type OrganizationMemberRole = (typeof organizationMemberRoles)[number];

export interface Organization {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface OrganizationMembership {
  readonly id: MembershipId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: OrganizationMemberRole;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}
